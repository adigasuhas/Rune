import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/settings (GET/POST) and /api/health, both previously 0%-covered. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

const settings: any[] = [];
const users: any[] = [];

const db = {
  setting: {
    findUnique: async ({ where }: any) => settings.find((s) => s.userId === where.userId) ?? null,
    upsert: async ({ where, update, create }: any) => {
      const existing = settings.find((s) => s.userId === where.userId);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: 'setting1', ...create };
      settings.push(row);
      return row;
    },
  },
  user: {
    findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
    update: async ({ where, data }: any) => {
      const user = users.find((u) => u.id === where.id);
      if (!user) throw new Error('not found');
      Object.assign(user, data);
      return user;
    },
    findMany: async () => [],
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  settings.length = 0;
  users.length = 0;
}

const req = (body?: unknown) =>
  (new Request('http://localhost/api/settings', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('GET /api/settings', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/settings/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns account defaults for a brand-new user with no settings row yet', async () => {
    users.push({ id: 'u1', name: 'Suhas', timezone: 'UTC', theme: 'dark', createdAt: new Date().toISOString() });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/settings/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timezone).toBe('UTC');
    expect(body.name).toBe('Suhas');
    // The bare weekday list gets converted to explicit dates and persisted.
    expect(settings).toHaveLength(1);
  });
});

describe('POST /api/settings', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/settings/route');
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it('updates the timezone on the user profile and persists settings', async () => {
    users.push({ id: 'u1', name: 'Suhas', timezone: 'UTC', theme: 'dark' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/settings/route');
    const res = await POST(req({ timezone: 'Asia/Kolkata' }));
    expect(res.status).toBe(200);
    expect(users[0].timezone).toBe('Asia/Kolkata');
  });

  it('drops unrecognized notification-preference keys instead of trusting the client shape', async () => {
    users.push({ id: 'u1', name: 'Suhas' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/settings/route');
    const res = await POST(req({ notificationPreferences: { NOT_A_REAL_TYPE: true, __proto__: { polluted: true } } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notificationPreferences).toEqual({});
  });
});

describe('GET /api/health', () => {
  it('reports ok with a working database', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.driver).toBe('postgres');
  });

  it('reports degraded (503) when the database check throws', async () => {
    const original = db.user.findMany;
    db.user.findMany = async () => { throw new Error('connection refused'); };
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
    db.user.findMany = original;
  });
});
