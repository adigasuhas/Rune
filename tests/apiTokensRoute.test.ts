import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/user/api-tokens (list / create / revoke) - browser-session-only token management. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: () => null }));

let seq = 0;
const nextId = () => `id${++seq}`;
interface Row {
  id: string;
  userId: string;
  name: string;
  prefix?: string;
  tokenHash?: string;
  createdAt?: Date;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt: Date | null;
}
type Where = { userId?: string; id?: string };
const tokens: Row[] = [];

const db = {
  apiToken: {
    findMany: async ({ where }: { where?: Where } = {}) => tokens.filter((t) => !where?.userId || t.userId === where.userId),
    findUnique: async ({ where }: { where: Where }) => tokens.find((t) => t.id === where.id) ?? null,
    create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt'> }) => {
      const row: Row = { id: nextId(), createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data };
      tokens.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const t = tokens.find((x) => x.id === where.id);
      if (!t) throw new Error('not found');
      Object.assign(t, data);
      return t;
    },
  },
};
vi.mock('@/lib/db', () => ({ db }));

const req = (body?: unknown, url = 'http://localhost/api/user/api-tokens', method?: string) => {
  const r = new Request(url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return Object.assign(r, { nextUrl: new URL(url) }) as never;
};

beforeEach(() => {
  vi.clearAllMocks();
  tokens.length = 0;
  seq = 0;
  getSessionUser.mockResolvedValue(null);
});

describe('/api/user/api-tokens', () => {
  it('401 when unauthenticated', async () => {
    const { GET, POST } = await import('@/app/api/user/api-tokens/route');
    expect((await GET()).status).toBe(401);
    expect((await POST(req({ name: 'x' }))).status).toBe(401);
  });

  it('403 when called WITH an API token - a token can never mint, list or revoke tokens', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1', viaApiToken: true });
    const { GET, POST, DELETE } = await import('@/app/api/user/api-tokens/route');
    expect((await GET()).status).toBe(403);
    expect((await POST(req({ name: 'escalate' }))).status).toBe(403);
    expect((await DELETE(req(undefined, 'http://localhost/api/user/api-tokens?id=x', 'DELETE'))).status).toBe(403);
    expect(tokens).toHaveLength(0);
  });

  it('creates a token, returns the plaintext exactly once, stores only the hash', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST, GET } = await import('@/app/api/user/api-tokens/route');
    const res = await POST(req({ name: 'WhatsApp bot', expiresInDays: 30 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^rune_pat_/);

    expect(tokens).toHaveLength(1);
    expect(JSON.stringify(tokens[0])).not.toContain(body.token);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const listed = await (await GET()).json();
    expect(listed.tokens).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(body.token);
    expect(JSON.stringify(listed)).not.toContain('tokenHash');
  });

  it('400 on a missing name or an out-of-range expiry', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/user/api-tokens/route');
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ name: '   ' }))).status).toBe(400);
    expect((await POST(req({ name: 'x', expiresInDays: 9999 }))).status).toBe(400);
  });

  it('caps active tokens per user at 10 (revoked ones do not count)', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/user/api-tokens/route');
    for (let i = 0; i < 10; i++) expect((await POST(req({ name: `t${i}` }))).status).toBe(201);
    expect((await POST(req({ name: 'one too many' }))).status).toBe(400);
    tokens[0].revokedAt = new Date();
    expect((await POST(req({ name: 'fits again' }))).status).toBe(201);
  });

  it('lists only the caller\'s own, non-revoked tokens', async () => {
    tokens.push({ id: nextId(), userId: 'u1', name: 'mine', prefix: 'rune_pat_abcd', createdAt: new Date(), revokedAt: null });
    tokens.push({ id: nextId(), userId: 'u1', name: 'gone', prefix: 'rune_pat_wxyz', createdAt: new Date(), revokedAt: new Date() });
    tokens.push({ id: nextId(), userId: 'u2', name: 'not mine', prefix: 'rune_pat_qqqq', createdAt: new Date(), revokedAt: null });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/user/api-tokens/route');
    const names = (await (await GET()).json()).tokens.map((t: { name: string }) => t.name);
    expect(names).toEqual(['mine']);
  });

  it('revokes the owner\'s token, and 404s for someone else\'s', async () => {
    const mine = { id: nextId(), userId: 'u1', name: 'mine', revokedAt: null };
    const theirs = { id: nextId(), userId: 'u2', name: 'theirs', revokedAt: null };
    tokens.push(mine, theirs);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/user/api-tokens/route');
    const u = (id: string) => req(undefined, `http://localhost/api/user/api-tokens?id=${id}`, 'DELETE');
    expect((await DELETE(u(theirs.id))).status).toBe(404);
    expect(theirs.revokedAt).toBeNull();
    expect((await DELETE(u(mine.id))).status).toBe(200);
    expect(mine.revokedAt).toBeInstanceOf(Date);
  });
});
