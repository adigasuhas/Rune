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

describe('POST /api/settings: partial saves', () => {
  it('saving one field leaves the others alone (the sidebar theme toggle used to reset leave days)', async () => {
    users.push({ id: 'u1', name: 'Suhas', timezone: 'UTC', theme: 'dark' });
    settings.push({ id: 's1', userId: 'u1', workStart: '07:30', workingDays: '2026-11-03:leave:Trip,cfg:2026-11', showOffDayWork: true, leaveAllowance: 25 });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/settings/route');
    expect((await POST(req({ theme: 'light' }))).status).toBe(200);
    expect(settings[0]).toMatchObject({ workStart: '07:30', workingDays: '2026-11-03:leave:Trip,cfg:2026-11', showOffDayWork: true, leaveAllowance: 25 });
    expect(users[0].theme).toBe('light');
  });

  it('saves and clears the time-off fields, and checks them', async () => {
    users.push({ id: 'u1', name: 'Suhas' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/settings/route');
    expect((await POST(req({ leaveAllowance: 25, sickLeaveAllowance: 10, leaveAllowancePer: 'PERIOD', availableFrom: '2026-09-01', availableUntil: '2027-08-31' }))).status).toBe(200);
    expect(settings[0]).toMatchObject({ leaveAllowance: 25, sickLeaveAllowance: 10, leaveAllowancePer: 'PERIOD', availableFrom: '2026-09-01', availableUntil: '2027-08-31' });
    expect((await POST(req({ leaveAllowance: null, availableUntil: null }))).status).toBe(200);
    expect(settings[0]).toMatchObject({ leaveAllowance: null, sickLeaveAllowance: 10, availableUntil: null });

    expect((await POST(req({ availableFrom: '2026-09-01', availableUntil: '2026-08-01' }))).status).toBe(400);
    expect((await POST(req({ availableFrom: '1 Sept' }))).status).toBe(400);
    expect((await POST(req({ leaveAllowance: -1 }))).status).toBe(400);
    expect((await POST(req({ leaveAllowancePer: 'MONTH' }))).status).toBe(400);
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
