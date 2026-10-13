import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers /api/accomplishments (GET/POST) - previously 0%. The real
 * analyticsUtils calculation functions run unmocked (they're pure, and
 * already have their own dedicated unit tests in tests/analytics.test.ts) -
 * this file focuses on the route's own auth/scoping/upsert behavior.
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;

const records: any[] = [];
const tasks: any[] = [];
const events: any[] = [];
const projects: any[] = [];
const users: any[] = [];

const db = {
  accomplishmentRecord: {
    findMany: async ({ where }: any = {}) => records.filter((r) => !where?.userId || r.userId === where.userId),
    upsert: async ({ where, update, create }: any) => {
      const existing = records.find((r) => r.userId === where.userId_date.userId && r.date === where.userId_date.date);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: nextId(), ...create };
      records.push(row);
      return row;
    },
  },
  task: { findMany: async ({ where }: any = {}) => tasks.filter((t) => !where?.userId || t.userId === where.userId) },
  calendarEvent: { findMany: async ({ where }: any = {}) => events.filter((e) => !where?.userId || e.userId === where.userId) },
  project: { findUnique: async ({ where }: any) => projects.find((p) => p.id === where.id) ?? null },
  user: { findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [records, tasks, events, projects, users]) arr.length = 0;
  seq = 0;
}

const req = (body?: unknown) =>
  (new Request('http://localhost/api/accomplishments', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
  users.push({ id: 'u1', timezone: 'UTC' });
});

describe('GET /api/accomplishments', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/accomplishments/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s own records', async () => {
    records.push({ id: nextId(), userId: 'u1', date: '2026-09-17' });
    records.push({ id: nextId(), userId: 'u2', date: '2026-09-17' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/accomplishments/route');
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/accomplishments', () => {
  it('400 when date is missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/accomplishments/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('creates a record for a day with a completed task, scoped to that user', async () => {
    tasks.push({ id: nextId(), userId: 'u1', name: 'Run sim', status: 'COMPLETED', date: '2026-09-17T10:00:00.000Z', priority: 'HIGH', projectId: null, postponeHistory: '[]' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/accomplishments/route');
    const res = await POST(req({ date: '2026-09-17', keyAchievements: 'Finished the run' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(body.date).toBe('2026-09-17');
    expect(body.keyAchievements).toBe('Finished the run');
    expect(JSON.parse(body.completedTasks)).toHaveLength(1);
  });

  it('re-posting the same date upserts (updates) rather than duplicating', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/accomplishments/route');
    await POST(req({ date: '2026-09-17', keyAchievements: 'First pass' }));
    await POST(req({ date: '2026-09-17', keyAchievements: 'Second pass' }));
    expect(records).toHaveLength(1);
    expect(records[0].keyAchievements).toBe('Second pass');
  });
});
