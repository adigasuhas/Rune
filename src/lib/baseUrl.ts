/**
 * The public origin this deployment is served from (e.g. `http://localhost:3000`
 * or `https://rune.example.com`).
 *
 * Everything that has to hand an absolute URL to something outside the app -
 * OAuth redirect URIs, post-login redirects, cookie security - goes through
 * here, so pointing Rune at a new host or port is a one-variable change:
 *
 *   RUNE_BASE_URL=https://rune.example.com
 *
 * When it is unset the request's own origin is used, which is correct on
 * Vercel/Netlify and for plain `localhost`. It is NOT reliable behind a
 * reverse proxy or in a container that does not forward the Host header
 * (the origin can come out as the internal `localhost:3000`), so any
 * self-hosted deployment behind a proxy should set RUNE_BASE_URL. An explicit
 * value is also safer than trusting a client-supplied Host header for
 * something that decides where a login redirects to.
 */

/** Returns the normalised RUNE_BASE_URL origin, or null if unset/invalid. */
export function configuredBaseUrl(): string | null {
  const raw = process.env.RUNE_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin; // drops any path / trailing slash
  } catch {
    return null;
  }
}

/** True if `value` is a usable RUNE_BASE_URL (used by env validation + the setup tool). */
export function isValidBaseUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

/** Anything with the origin of the incoming request (NextRequest satisfies this). */
export interface HasOrigin {
  nextUrl: { origin: string };
}

export function getBaseUrl(req?: HasOrigin): string {
  return configuredBaseUrl() ?? req?.nextUrl.origin ?? 'http://localhost:3000';
}

/** Absolute URL for an in-app path, rooted at the deployment's public origin. */
export function absoluteUrl(path: string, req?: HasOrigin): URL {
  return new URL(path, getBaseUrl(req));
}

function isPlainHttpLocalhost(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

/**
 * Should cookies be marked `Secure`? Follows the deployment's actual scheme
 * where it is known, so a production build served over plain http on
 * localhost (the "run it on my laptop" case) doesn't set cookies that
 * Safari refuses to keep, which would break sign-in with no error.
 *
 * It only ever relaxes `Secure` for that plain-http-localhost case: behind an
 * HTTPS-terminating proxy the request origin can read `http://`, and
 * dropping `Secure` there would be a real security regression, so
 * production stays Secure unless the base URL says otherwise.
 */
export function shouldUseSecureCookies(req?: HasOrigin): boolean {
  const configured = configuredBaseUrl();
  if (configured) return configured.startsWith('https://');
  if (process.env.NODE_ENV === 'production') {
    return !(req && isPlainHttpLocalhost(req.nextUrl.origin));
  }
  return !!req?.nextUrl.origin.startsWith('https://');
}
