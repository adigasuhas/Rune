import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { hashApiToken, isApiToken, parseBearer } from './apiTokens';
import { shouldUseSecureCookies } from './baseUrl';

// No hardcoded fallback: a shared-repo default secret is a public secret.
// Computed lazily (not at module load) so `next build`'s route-collection
// pass doesn't need JWT_SECRET set - only actually signing/verifying a
// session does, at request time.
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Generate one (e.g. `openssl rand -base64 32`) and set it in your environment - see docs/ADMINISTRATOR_GUIDE.md.'
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name?: string;
  /** Must match the user's current `sessionVersion` - lets suspend/delete/
   *  "sign out everywhere" invalidate every existing token immediately. */
  sv?: number;
  /** True when this identity came from a personal access token, not a browser session. */
  viaApiToken?: boolean;
  [key: string]: unknown;
}

export async function signSessionToken(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function readToken(req?: NextRequest): string | undefined {
  if (req) return req.cookies.get('rune-session')?.value;
  return undefined;
}

async function readTokenFromCookieStore(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('rune-session')?.value;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Active-user revalidation
//
// The session token is a stateless 7-day JWT. Without a check against the
// user record, a suspended or deleted account keeps full access until the
// token expires. `getSessionUser` now re-checks the DB, cached briefly per
// user so it costs ~one extra indexed lookup per 30s of activity. It FAILS
// OPEN on a DB error (a transient outage must not sign everyone out) and only
// returns null when the account is definitively gone or disabled.
// ---------------------------------------------------------------------------
const activeCache = new Map<string, { active: boolean; version: number | null; checkedAt: number }>();
const ACTIVE_TTL_MS = 30_000;

function isUserActive(user: { deletedAt?: Date | null; status?: string | null } | null | undefined): boolean {
  return Boolean(user) && !user!.deletedAt && user!.status !== 'SUSPENDED' && user!.status !== 'DISABLED';
}

async function getAccountState(userId: string): Promise<{ active: boolean; version: number | null }> {
  const now = Date.now();
  const cached = activeCache.get(userId);
  if (cached && now - cached.checkedAt < ACTIVE_TTL_MS) return cached;

  let state: { active: boolean; version: number | null } = { active: true, version: null };
  try {
    const { db } = await import('./db');
    const user = await db.user.findUnique({ where: { id: userId } });
    state = {
      active: isUserActive(user),
      version: user ? (user.sessionVersion ?? 0) : null,
    };
  } catch (err) {
    console.warn('[auth] active-user check failed, allowing session:', (err as Error).message);
    state = { active: true, version: null }; // fail open
  }
  activeCache.set(userId, { ...state, checkedAt: now });
  return state;
}

/** Invalidate the cached active/inactive verdict for a user (call after suspend/delete/reinstate). */
export function invalidateSessionCache(userId: string) {
  activeCache.delete(userId);
}

async function readBearerToken(req?: NextRequest): Promise<string | null> {
  try {
    const header = req ? req.headers.get('authorization') : (await headers()).get('authorization');
    const bearer = parseBearer(header);
    return isApiToken(bearer) ? bearer : null;
  } catch {
    return null; // outside a request scope
  }
}

const TOKEN_LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

/**
 * Resolves a personal access token to its owner. Returns null only when the
 * token is definitively unusable (unknown / revoked / expired / inactive
 * account). A database failure is NOT reported as "invalid token" - it
 * propagates (a 500), so clients don't tell users to replace a good token
 * during an outage. Either way access is never granted on an error.
 */
async function resolveApiToken(rawToken: string): Promise<SessionPayload | null> {
  const { db } = await import('./db');
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashApiToken(rawToken) }, include: { user: true } });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  const user = row.user;
  if (!isUserActive(user)) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOKEN_LAST_USED_WRITE_INTERVAL_MS) {
    db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { userId: user.id, email: user.email, name: user.name ?? undefined, viaApiToken: true, tokenId: row.id };
}

export async function getSessionUser(req?: NextRequest): Promise<SessionPayload | null> {
  // An Authorization bearer token, when present, is authoritative - never
  // fall back to a cookie if it is invalid.
  const bearer = await readBearerToken(req);
  if (bearer) return resolveApiToken(bearer);

  const token = readToken(req) ?? (await readTokenFromCookieStore());
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const state = await getAccountState(payload.userId);
  if (!state.active) return null;
  // Only reject on a definite version mismatch; a null version means the DB
  // check failed and we fail open. A token without `sv` counts as version 0,
  // so bumping the version (password change, suspend, "sign out
  // everywhere") revokes it too - every token Rune issues carries `sv`.
  if (state.version !== null && (typeof payload.sv === 'number' ? payload.sv : 0) !== state.version) return null;
  return payload;
}

/** Signature-only check for middleware / hot paths - no DB round-trip. */
export async function getSessionTokenClaims(req?: NextRequest): Promise<SessionPayload | null> {
  const token = readToken(req) ?? (await readTokenFromCookieStore());
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set('rune-session', token, {
    httpOnly: true,
    // Follows RUNE_BASE_URL's scheme (see baseUrl.ts) rather than NODE_ENV.
    secure: shouldUseSecureCookies(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set('rune-session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
}
