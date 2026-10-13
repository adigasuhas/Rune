import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { sanitizeNotebookHtml, sanitizePlainText } from '@/lib/sanitizeHtml';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { parsePageMetadata } from '@/lib/notebookExport';
import { parseLatexToHtml } from '@/lib/latex/renderer';

describe('sanitizeNotebookHtml — the stored-XSS backstop', () => {
  it('strips <script>', () => {
    expect(sanitizeNotebookHtml('<p>hi</p><script>alert(1)</script>')).not.toContain('<script');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeNotebookHtml('<img src="/api/uploads/x.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('drops javascript: hrefs but keeps the text', () => {
    const out = sanitizeNotebookHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });

  it('keeps https links and forces safe rel on target=_blank', () => {
    const out = sanitizeNotebookHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toMatch(/rel="[^"]*noopener/);
  });

  it('removes remote image srcs (SSRF surface), allows the upload proxy and data URIs', () => {
    expect(sanitizeNotebookHtml('<img src="http://169.254.169.254/latest/meta-data/">')).not.toContain('169.254');
    expect(sanitizeNotebookHtml('<img src="/api/uploads/abc.png">')).toContain('/api/uploads/abc.png');
    expect(sanitizeNotebookHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png');
  });

  it('keeps KaTeX/MathML output', () => {
    const out = sanitizeNotebookHtml('<span class="katex"><math><mrow><mi>x</mi></mrow></math></span>');
    expect(out).toContain('katex');
    expect(out.toLowerCase()).toContain('math');
  });

  it('strips url() from style attributes (SSRF surface during Puppeteer PDF export)', () => {
    const out = sanitizeNotebookHtml('<div style="background-image:url(http://169.254.169.254/latest/meta-data/)">x</div>');
    expect(out).not.toContain('169.254');
    expect(out).not.toContain('url(');
  });

  it('strips @import from style attributes', () => {
    const out = sanitizeNotebookHtml('<div style="@import url(http://evil.example/x.css);">x</div>');
    expect(out).not.toContain('@import');
    expect(out).not.toContain('evil.example');
  });

  it('keeps harmless style declarations like KaTeX color/margin', () => {
    const out = sanitizeNotebookHtml('<span style="color: red; margin-left: 2px;">x</span>');
    expect(out).toContain('color: red');
    expect(out).toContain('margin-left: 2px');
  });
});

describe('sanitizePlainText', () => {
  it('strips all markup', () => {
    expect(sanitizePlainText('<b>Notebook</b> "title"')).toBe('Notebook "title"');
  });
});

describe('latex renderer — no unescaped interpolation reaches the sink', () => {
  const render = (src: string) => {
    const html = parseLatexToHtml(src);
    return sanitizeNotebookHtml(html);
  };

  it('href attribute-breakout attempt cannot inject an event handler', () => {
    const out = render('\\href{" onmouseover="alert(1)}{hi}');
    expect(out).not.toContain('onmouseover');
  });

  it('textcolor with a hostile colour name cannot break out of style', () => {
    const out = render('\\textcolor{x"><img src=x onerror=alert(1)>}{hi}');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img src=x');
  });

  it('section title is escaped (no live tag reaches the DOM)', () => {
    const out = render('\\section{<img src=x onerror=alert(1)>}');
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain('&lt;img');
  });

  it('renders a normal https link', () => {
    const out = render('\\href{https://example.com}{Example}');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('Example');
  });
});

describe('parsePageMetadata — CSS injection guard', () => {
  it('rejects a value that tries to break out of the declaration', () => {
    const meta = parsePageMetadata('<!--RUNE_METADATA_START{"lineHeight":"1.6} body{} x"}RUNE_METADATA_END-->');
    expect(meta.lineHeight).toBeUndefined();
  });
  it('accepts a plain valid color and length', () => {
    const meta = parsePageMetadata('<!--RUNE_METADATA_START{"fontColor":"#ff0000","fontSize":"12pt","textAlign":"center"}RUNE_METADATA_END-->');
    expect(meta.fontColor).toBe('#ff0000');
    expect(meta.fontSize).toBe('12pt');
    expect(meta.textAlign).toBe('center');
  });
  it('falls back cleanly on malformed JSON', () => {
    const meta = parsePageMetadata('<!--RUNE_METADATA_START{bad jsonRUNE_METADATA_END-->');
    expect(meta.textAlign).toBe('left');
  });
});

describe('rateLimit', () => {
  it('allows up to the limit then blocks', () => {
    const key = 'k' + Math.random();
    let lastOk = true;
    for (let i = 0; i < 5; i++) lastOk = rateLimit('test', key, 5, 60_000).ok;
    expect(lastOk).toBe(true);
    expect(rateLimit('test', key, 5, 60_000).ok).toBe(false);
  });
  it('is per-identity', () => {
    const a = 'a' + Math.random();
    const b = 'b' + Math.random();
    for (let i = 0; i < 5; i++) rateLimit('test', a, 5, 60_000);
    expect(rateLimit('test', a, 5, 60_000).ok).toBe(false);
    expect(rateLimit('test', b, 5, 60_000).ok).toBe(true);
  });
});

describe('clientKey — X-Forwarded-For can\'t be used to pick a fresh identity', () => {
  const req = (h: Record<string, string>) => ({ headers: new Headers(h) });
  const orig = process.env.RUNE_TRUSTED_PROXY_HOPS;
  beforeEach(() => { delete process.env.RUNE_TRUSTED_PROXY_HOPS; });
  afterAll(() => { if (orig === undefined) delete process.env.RUNE_TRUSTED_PROXY_HOPS; else process.env.RUNE_TRUSTED_PROXY_HOPS = orig; });

  it('uses the entry the trusted proxy appended, not client-supplied ones', () => {
    // A client sends a forged header; the proxy appends the real address.
    expect(clientKey(req({ 'x-forwarded-for': '192.0.2.1, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientKey(req({ 'x-forwarded-for': '192.0.2.77, 198.51.100.4, 203.0.113.9' }))).toBe('203.0.113.9');
  });
  it('rotating forged values all map to the same identity behind a proxy', () => {
    const keys = new Set(Array.from({ length: 25 }, (_, i) => clientKey(req({ 'x-forwarded-for': `192.0.2.${i}, 203.0.113.9` }))));
    expect([...keys]).toEqual(['203.0.113.9']);
  });
  it('honours RUNE_TRUSTED_PROXY_HOPS for proxy chains', () => {
    process.env.RUNE_TRUSTED_PROXY_HOPS = '2';
    expect(clientKey(req({ 'x-forwarded-for': '192.0.2.1, 203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
  });
  it('falls back to 1 hop on a bad setting, and to x-real-ip with no list', () => {
    process.env.RUNE_TRUSTED_PROXY_HOPS = 'lots';
    expect(clientKey(req({ 'x-forwarded-for': '192.0.2.1, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientKey(req({ 'x-real-ip': '203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientKey(req({}))).toBe('local');
  });
});

describe('admin allow-list', () => {
  beforeEach(() => vi.resetModules());
  it('honours RUNE_ADMIN_EMAILS', async () => {
    vi.stubEnv('RUNE_ADMIN_EMAILS', 'boss@lab.edu, pi@uni.edu');
    vi.stubEnv('NODE_ENV', 'production');
    const { isAdminEmail } = await import('@/lib/admin');
    expect(isAdminEmail('BOSS@lab.edu')).toBe(true);
    expect(isAdminEmail('pi@uni.edu')).toBe(true);
    expect(isAdminEmail('random@lab.edu')).toBe(false);
    vi.unstubAllEnvs();
  });
  it('knowing the built-in developer account\'s email is not by itself admin access — that comes from its DB role, not this allow-list', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RUNE_ADMIN_EMAILS', '');
    const { isAdminEmail } = await import('@/lib/admin');
    const { DEVELOPER_EMAIL } = await import('@/lib/devAccount');
    expect(isAdminEmail(DEVELOPER_EMAIL)).toBe(false);
    vi.unstubAllEnvs();
  });
});
