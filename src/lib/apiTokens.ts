import crypto from 'node:crypto';

export const API_TOKEN_PREFIX = 'rune_pat_';
export const MAX_API_TOKENS_PER_USER = 10;

export function isApiToken(value: string | null | undefined): value is string {
  return !!value && value.startsWith(API_TOKEN_PREFIX);
}

/** 256 bits of entropy, so a plain SHA-256 is enough (no slow KDF needed for a random secret). */
export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(): { token: string; tokenHash: string; prefix: string } {
  const token = API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashApiToken(token), prefix: token.slice(0, API_TOKEN_PREFIX.length + 4) };
}

/** Extracts a `Bearer <token>` credential from an Authorization header value. */
export function parseBearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((header ?? '').trim());
  return m ? m[1] : null;
}

/**
 * API paths a personal access token may call. Deliberately excludes
 * password/account/backup/admin/settings/teams routes, project sharing
 * (`/collaborators`), and token management itself, so a leaked chat-bot token
 * can read and edit planning data but can never take over the account or
 * grant anyone else access. Enforced in src/proxy.ts.
 */
const API_TOKEN_ALLOWED_PREFIXES = [
  '/api/auth/me',
  '/api/tasks',
  '/api/calendar',
  '/api/jobs',
  '/api/instruments',
  '/api/digest',
  '/api/accomplishments',
  '/api/notifications',
  '/api/search',
  '/api/teammates',
];

// A project itself, but none of its sub-resources (collaborators, notebook, wall).
const PROJECT_PATH = /^\/api\/projects(\/[^/]+)?$/;

export function isApiPathAllowedForToken(pathname: string): boolean {
  // Defence in depth: the URL parser already normalizes dot-segments before the
  // proxy sees a path, but never let a traversal-shaped path match a prefix.
  if (pathname.includes('..') || pathname.includes('%') || pathname.includes('\\')) return false;
  if (PROJECT_PATH.test(pathname)) return true;
  return API_TOKEN_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
