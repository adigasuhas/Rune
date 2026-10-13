import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * getSessionUser() re-checks every cookie against the account's
 * sessionVersion, so a password change, suspension or "sign out everywhere"
 * revokes tokens that were already issued.
 */
const db = { user: { findUnique: vi.fn() } };
vi.mock('@/lib/db', () => ({ db }));

const withCookie = (token: string) =>
  new NextRequest('http://localhost/api/tasks', { headers: { cookie: `rune-session=${token}` } });

beforeEach(() => {
  vi.resetModules(); // fresh 30-second account-state cache per test
  vi.clearAllMocks();
  vi.stubEnv('JWT_SECRET', 'test-secret-that-is-long-enough-for-hs256-signing');
});

describe('session version check', () => {
  it('accepts a token whose version matches the account', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', sessionVersion: 3 });
    const { signSessionToken, getSessionUser } = await import('@/lib/auth');
    const token = await signSessionToken({ userId: 'u1', email: 'u1@x.org', sv: 3 });
    expect(await getSessionUser(withCookie(token))).toMatchObject({ userId: 'u1' });
  });

  it('rejects a token issued before the version was bumped', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', sessionVersion: 4 });
    const { signSessionToken, getSessionUser } = await import('@/lib/auth');
    const token = await signSessionToken({ userId: 'u1', email: 'u1@x.org', sv: 3 });
    expect(await getSessionUser(withCookie(token))).toBeNull();
  });

  it('a token with no version claim counts as version 0 - revoked once the version moves', async () => {
    const { signSessionToken, getSessionUser } = await import('@/lib/auth');
    const token = await signSessionToken({ userId: 'u1', email: 'u1@x.org' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', sessionVersion: 1 });
    expect(await getSessionUser(withCookie(token))).toBeNull();
  });

  it('rejects a deleted or suspended account', async () => {
    const { signSessionToken, getSessionUser } = await import('@/lib/auth');
    const token = await signSessionToken({ userId: 'u1', email: 'u1@x.org', sv: 0 });
    db.user.findUnique.mockResolvedValue(null);
    expect(await getSessionUser(withCookie(token))).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', sessionVersion: 0 });
    const { signSessionToken } = await import('@/lib/auth');
    const forged = await signSessionToken({ userId: 'u1', email: 'u1@x.org', sv: 0 });
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', 'a-completely-different-secret-for-this-server-123');
    const { getSessionUser } = await import('@/lib/auth');
    expect(await getSessionUser(withCookie(forged))).toBeNull();
  });
});
