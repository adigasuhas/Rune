/**
 * Small in-process rate limiter.
 *
 * No Redis, no external dependency - in keeping with the project's
 * minimal-config approach. A fixed-window counter keyed by
 * `bucket + client identifier`, held in a Map that is swept lazily. This is
 * per-instance (fine for a single-node self-host or a `next start` server); a
 * multi-instance deployment should front it with a shared store, but even
 * per-instance limiting closes the "unbounded" hole the audit flagged
 * (credential stuffing, invite-code brute force, PDF-export resource
 * exhaustion).
 */
import { NextRequest, NextResponse } from 'next/server';

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * How many reverse proxies sit in front of Rune and append to
 * X-Forwarded-For (RUNE_TRUSTED_PROXY_HOPS, default 1: one Caddy, nginx,
 * Traefik or platform edge). Invalid values fall back to 1.
 */
export function trustedProxyHops(): number {
  const raw = process.env.RUNE_TRUSTED_PROXY_HOPS?.trim();
  const n = raw ? Number(raw) : 1;
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 1;
}

/**
 * Client identity for IP-keyed limits.
 *
 * X-Forwarded-For is a list each hop appends to, so only the right-hand
 * entries were written by infrastructure we run; everything to their left
 * came from the client and is forgeable. With N trusted proxies the client's
 * real address is the Nth entry from the right. (Reading the *first* entry,
 * as this used to, let anyone pick a fresh identity per request.)
 *
 * Next's own server only fills X-Forwarded-For with the socket address when
 * the request arrived without one, so a Rune exposed directly to the
 * internet, with no proxy, still can't tell a forged header from a real
 * one. Deploy behind a proxy (DEPLOY.md); the per-account limits on sign-in
 * and recovery hold either way.
 */
export function clientKey(req: Pick<NextRequest, 'headers'>): string {
  const chain = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length) return chain[Math.max(0, chain.length - trustedProxyHops())];
  return req.headers.get('x-real-ip')?.trim() || 'local';
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
}

/**
 * @param bucket   logical name for the limited action ("auth", "upload", ...)
 * @param id       caller identity (usually `clientKey(req)` or a userId)
 * @param limit    max requests per window
 * @param windowMs window length in ms
 */
export function rateLimit(bucket: string, id: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${id}`;
  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return { ok: entry.count <= limit, remaining, retryAfter };
}

/** 429 response with a Retry-After header, or null when the request is under the limit. */
export function enforceRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
  id?: string
): NextResponse | null {
  const result = rateLimit(bucket, id ?? clientKey(req), limit, windowMs);
  if (result.ok) return null;
  return NextResponse.json(
    { error: 'Too many requests. Wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
  );
}
