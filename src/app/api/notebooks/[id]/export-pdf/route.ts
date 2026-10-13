import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildNotebookExportHtml, ExportOptions, ExportPage } from '@/lib/notebookExport';
import { enforceRateLimit } from '@/lib/rateLimit';
import { readLocalUpload, mimeForStoredName } from '@/lib/storage';

const exportOptionsSchema = z.object({
  profile: z.string().max(100).optional(),
  titleFont: z.string().max(100).optional(),
  bodyFont: z.string().max(100).optional(),
  includeCover: z.boolean().optional(),
  includeHeader: z.boolean().optional(),
  includeFooter: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
});

/**
 * Replaces every `/api/uploads/<file>` image reference with an inline
 * data: URI read straight from disk (these are the notebook owner's own
 * images - already authorised above). Puppeteer then needs zero network
 * access to render the PDF.
 */
async function inlineLocalImages(html: string): Promise<string> {
  const refs = new Set<string>();
  html.replace(/\/api\/uploads\/([a-f0-9]{8}_[a-f0-9]{24}\.(?:png|jpg|gif|webp))/g, (_m, f: string) => {
    refs.add(f);
    return _m;
  });
  let out = html;
  for (const f of refs) {
    const buf = await readLocalUpload(f);
    if (!buf) continue;
    const dataUri = `data:${mimeForStoredName(f)};base64,${buf.toString('base64')}`;
    out = out.split(`/api/uploads/${f}`).join(dataUri);
  }
  return out;
}

// Puppeteer needs a real Node process (spawns a Chromium child process) — cannot run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedKatexCssBlock: string | null = null;

/**
 * Inlines KaTeX's CSS + every referenced font file as base64 data URIs, so the
 * exported PDF renders math correctly with zero network dependency (fixes the
 * old CDN-based export's offline/version-mismatch bugs). Computed once per
 * server process and cached in memory.
 */
/**
 * Locates the on-disk `katex/dist` directory. `require.resolve` is preferred
 * (scopes the serverless file-trace), but under Turbopack it can return a
 * bundler-internal `[project]/…` pseudo-path that isn't real, so we validate
 * the result and fall back to the app's own `node_modules`.
 */
function resolveKatexDistDir(): string | null {
  const candidates: string[] = [];
  try {
    const pkg = require.resolve('katex/package.json');
    if (pkg && path.isAbsolute(pkg) && !pkg.startsWith('[')) {
      candidates.push(path.join(path.dirname(pkg), 'dist'));
    }
  } catch {
    /* fall through to cwd-based lookup */
  }
  // Runtime-only fallback. `outputFileTracingIncludes` in next.config.ts is
  // what actually ships katex/dist into the standalone build; keep this path
  // out of the file trace so it doesn't drag the whole project in.
  candidates.push(path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', 'katex', 'dist'));
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'katex.min.css'))) return dir;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function getInlinedKatexCssBlock(): string {
  if (cachedKatexCssBlock) return cachedKatexCssBlock;

  const katexDistDir = resolveKatexDistDir();
  if (!katexDistDir) {
    // Math still renders (KaTeX emits its own markup) - just without the
    // stylesheet's spacing tweaks. Better a slightly-off equation than a 500.
    console.warn('[export-pdf] katex/dist not found on disk; exporting without inlined KaTeX CSS');
    cachedKatexCssBlock = '';
    return cachedKatexCssBlock;
  }

  const cssPath = path.join(katexDistDir, 'katex.min.css');
  let css = fs.readFileSync(cssPath, 'utf-8');

  css = css.replace(/url\(fonts\/([^)]+)\)/g, (match, filename: string) => {
    try {
      const fontPath = path.join(katexDistDir, 'fonts', filename);
      const data = fs.readFileSync(fontPath);
      const ext = path.extname(filename).slice(1);
      const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';
      return `url(data:${mime};base64,${data.toString('base64')})`;
    } catch {
      return match;
    }
  });

  cachedKatexCssBlock = `<style>${css}</style>`;
  return cachedKatexCssBlock;
}

// True on Vercel, AWS Lambda, and Netlify Functions - the common markers each
// platform sets on its own serverless runtime. Used to pick a bundled,
// serverless-safe Chromium instead of hunting for a system-installed browser
// that won't exist on an ephemeral/read-only filesystem.
function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

function resolveLocalChromiumExecutablePath(): string | null {
  // Deliberately dynamic (operator-supplied path) - safe to exclude from
  // Next's static file trace, unlike an accidental process.cwd()-based path.
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    fs.existsSync(/*turbopackIgnore: true*/ process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    '/snap/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  // Absolute system paths outside the app - nothing here belongs in the
  // build's file trace (a bare variable made Turbopack trace the whole project).
  for (const candidate of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  }
  return null;
}

/**
 * Resolves both the Chromium binary and the launch args puppeteer-core needs,
 * so PDF export works the same way regardless of host:
 * - serverless (Vercel/Lambda/Netlify): bundled @sparticuz/chromium binary
 * - explicit override: PUPPETEER_EXECUTABLE_PATH (self-host/Docker/VPS)
 * - local dev / traditional server: common system Chrome/Chromium install paths
 */
async function resolveLaunchOptions(): Promise<{ executablePath: string; args: string[] } | null> {
  if (isServerlessRuntime() && !process.env.PUPPETEER_EXECUTABLE_PATH) {
    try {
      const chromium = (await import('@sparticuz/chromium')).default;
      const executablePath = await chromium.executablePath();
      return { executablePath, args: chromium.args };
    } catch (err) {
      console.error('Failed to load @sparticuz/chromium on a serverless runtime', err);
      return null;
    }
  }

  const executablePath = resolveLocalChromiumExecutablePath();
  if (!executablePath) return null;
  return { executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  // Each call spawns a full Chromium process - cap it hard per user.
  const limited = enforceRateLimit(req, 'pdf-export', 6, 60_000, session.userId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const notebook = await db.notebook.findUnique({ where: { id } });
    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }

    const parsed = exportOptionsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { profile, titleFont, bodyFont, includeCover, includeHeader, includeFooter, includeSummary } = parsed.data;

    const page = await db.notebookPage.findUnique({ where: { notebookId: id } });
    if (!page) {
      return NextResponse.json({ error: 'This notebook has no document yet.' }, { status: 404 });
    }
    const orderedPages: ExportPage[] = [{
      id: page.id,
      title: page.title,
      content: page.content,
      tags: page.tags || []
    }];

    const user = await db.user.findUnique({ where: { id: session.userId } });
    const project = notebook.projectId ? await db.project.findUnique({ where: { id: notebook.projectId } }) : null;

    const options: ExportOptions = {
      notebookTitle: notebook.title,
      projectName: project ? project.name : null,
      authorName: user?.name || 'User Name',
      profile: profile === 'research' || profile === 'daily' ? profile : 'full',
      titleFont: typeof titleFont === 'string' ? titleFont : 'Raleway',
      bodyFont: typeof bodyFont === 'string' ? bodyFont : 'Inter',
      includeCover: includeCover !== false,
      includeHeader: includeHeader !== false,
      includeFooter: includeFooter !== false,
      includeSummary: includeSummary === true
    };

    const katexCssBlock = getInlinedKatexCssBlock();
    const builtHtml = buildNotebookExportHtml(orderedPages, options, katexCssBlock);
    const html = await inlineLocalImages(builtHtml);

    const launchOptions = await resolveLaunchOptions();
    if (!launchOptions) {
      return NextResponse.json({
        error: 'No Chromium executable found on the server. Set PUPPETEER_EXECUTABLE_PATH to a Chromium/Chrome binary, or deploy with @sparticuz/chromium available on serverless.'
      }, { status: 500 });
    }

    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.launch(launchOptions);

    try {
      const page = await browser.newPage();

      // SSRF hardening: block ALL network requests during rendering. The HTML
      // is fully self-contained (KaTeX CSS + fonts inlined, images inlined as
      // data: URIs above), so a crafted `<img src="http://169.254.169.254/...">`
      // or `file://` reference in notebook content simply fails to load
      // instead of being fetched by Chromium.
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') {
          request.continue();
        } else {
          request.abort();
        }
      });
      await page.setJavaScriptEnabled(false);

      await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true
      });

      const fileNameBase = (orderedPages.length === 1 ? orderedPages[0].title : notebook.title)
        .replace(/[^a-z0-9\- ]/gi, '')
        .trim()
        .replace(/\s+/g, '_') || 'notebook-export';

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileNameBase}.pdf"`
        }
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error('Error generating notebook PDF export:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
