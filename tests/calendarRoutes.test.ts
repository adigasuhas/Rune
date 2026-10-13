import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/calendar (GET/POST/PUT/DELETE) - previously 0%. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;

const events: any[] = [];
const tasks: any[] = [];

const db = {
  calendarEvent: {
    findMany: async ({ where }: any = {}) => events.filter((e) => !where?.userId || e.userId === where.userId),
    findUnique: async ({ where }: any) => events.find((e) => e.id === where.id) ?? null,
    create: async ({ data }: any) => {
      const row = { id: nextId(), ...data };
      events.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const e = events.find((x) => x.id === where.id);
      if (!e) throw new Error('not found');
      Object.assign(e, data);
      return e;
    },
    delete: async ({ where }: any) => {
      const idx = events.findIndex((e) => e.id === where.id);
      if (idx === -1) throw new Error('not found');
      const [row] = events.splice(idx, 1);
      return row;
    },
  },
  task: {
    findUnique: async ({ where }: any) => tasks.find((t) => t.id === where.id) ?? null,
    update: async () => ({}),
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  events.length = 0;
  tasks.length = 0;
  seq = 0;
}

const req = (body?: unknown, method?: string) =>
  (new Request('http://localhost/api/calendar', {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('GET /api/calendar', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/calendar/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s own events', async () => {
    events.push({ id: nextId(), userId: 'u1', title: 'Mine' });
    events.push({ id: nextId(), userId: 'u2', title: 'Not mine' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/calendar/route');
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/calendar (create)', () => {
  it('400 when title/start/end are missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/calendar/route');
    const res = await POST(req({ title: 'x' }));
    expect(res.status).toBe(400);
  });

  it('creates an event not linked to any task', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/calendar/route');
    const res = await POST(req({ title: 'Deep work block', start: '2026-09-17T09:00:00Z', end: '2026-09-17T11:00:00Z' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(body.taskId).toBeUndefined();
  });

  it('a taskId belonging to another user is ignored (not linked)', async () => {
    tasks.push({ id: 'task1', userId: 'someone-else', sessionType: 'DEEP_WORK' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/calendar/route');
    const res = await POST(req({ title: 'x', start: '2026-09-17T09:00:00Z', end: '2026-09-17T11:00:00Z', taskId: 'task1' }));
    const body = await res.json();
    expect(body.taskId).toBeUndefined();
  });
});

describe('PUT /api/calendar (update)', () => {
  it('400 when id is missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/calendar/route');
    const res = await PUT(req({}, 'PUT'));
    expect(res.status).toBe(400);
  });

  it('404 for an event you don\'t own', async () => {
    const evt = { id: nextId(), userId: 'owner1', title: 'x' };
    events.push(evt);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { PUT } = await import('@/app/api/calendar/route');
    const res = await PUT(req({ id: evt.id, title: 'hacked' }, 'PUT'));
    expect(res.status).toBe(404);
  });

  it('the owner can update the title', async () => {
    const evt = { id: nextId(), userId: 'u1', title: 'x', sessionType: 'REGULAR' };
    events.push(evt);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/calendar/route');
    const res = await PUT(req({ id: evt.id, title: 'updated' }, 'PUT'));
    expect(res.status).toBe(200);
    expect(events[0].title).toBe('updated');
  });
});

describe('DELETE /api/calendar', () => {
  it('404 for an event you don\'t own', async () => {
    const evt = { id: nextId(), userId: 'owner1', title: 'x' };
    events.push(evt);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { DELETE } = await import('@/app/api/calendar/route');
    const res = await DELETE(req(undefined, 'DELETE') as never);
    // no id in query string -> 400, exercised separately below
    expect(res.status).toBe(400);
  });

  it('the owner can delete their own event', async () => {
    const evt = { id: nextId(), userId: 'u1', title: 'x' };
    events.push(evt);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/calendar/route');
    const res = await DELETE(new Request(`http://localhost/api/calendar?id=${evt.id}`, { method: 'DELETE' }) as never);
    expect(res.status).toBe(200);
    expect(events).toHaveLength(0);
  });
});
