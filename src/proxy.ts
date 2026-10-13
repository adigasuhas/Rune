import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { isApiPathAllowedForToken, isApiToken, parseBearer } from '@/lib/apiTokens';

/**
 * Server-side authentication gate.
 *
 * Previously route protection was entirely client-side (`router.push` in a
 * `useEffect`), so every protected screen was statically prerendered and
 * served to anonymous visitors, then redirected in the browser. This runs
 * before the response is produced: no valid session cookie -> redirect to
 * /login (pages) or 401 (API), so protected HTML and API responses never
 * leave the server for an unauthenticated caller.
 *
 * It verifies only the JWT signature + expiry (edge-safe, no DB). Account
 * status / deletion is enforced at the data layer (`getSessionUser`,
 * `requireAdmin`).
 */

// Paths that must remain reachable without a session.
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/docs',
  '/pricing',
  '/features',
  '/api/auth/', // signup, password-login, forgot/reset password, logout, me
  '/api/health',
  '/_next/',
  '/favicon',
  '/robots.txt',
  '/sitemap.xml',
];

// `/` renders the public marketing page when logged out - handled in-page.
const PUBLIC_EXACT = new Set(['/']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf)$/i.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('rune-session')?.value;
  if (!token) return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Personal access tokens (MCP server / chat bots) are confined to an
  // allow-list of data endpoints. This check runs BEFORE the public-prefix
  // check on purpose: /api/auth/* is public to browsers, but a bearer token
  // must never reach password / logout / account routes. The token itself is
  // verified against the DB in getSessionUser.
  if (isApiToken(parseBearer(req.headers.get('authorization')))) {
    if (pathname.startsWith('/api/') && isApiPathAllowedForToken(pathname)) return NextResponse.next();
    return NextResponse.json({ error: 'This API token cannot access that endpoint.' }, { status: 403 });
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (await hasValidSession(req)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

