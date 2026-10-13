/**
 * Pages a signed-out visitor may open, and that render full-bleed (no app
 * sidebar/header). One list, used by ClientLayout for both decisions - the
 * forgot/reset-password pages were once missing from a hand-copied version
 * of it, which bounced every signed-out "Forgot your password?" click back
 * to /login. src/proxy.ts is the server-side counterpart.
 */
const PUBLIC_PAGES = new Set(['/login', '/forgot-password', '/reset-password', '/pricing', '/features']);

export function isPublicPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PAGES.has(pathname) || pathname === '/docs' || pathname.startsWith('/docs/');
}
