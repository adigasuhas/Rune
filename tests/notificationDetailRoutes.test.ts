import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/notifications/[id] (PATCH) - previously 0%. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;
const notifications: any[] = [];

const db = {
  notification: {
    findUnique: async ({ where }: any) => notifications.find((n) => n.id === where.id) ?? null,
    update: async ({ where, data }: any) => {
      const n = notifications.find((x) => x.id === where.id);
      if (!n) throw new Error('not found');
      Object.assign(n, data);
      return n;
    },
  },
};
vi.mock('@/lib/db', () => ({ db }));

beforeEach(() => {
  vi.clearAllMocks();
  notifications.length = 0;
  seq = 0;
  getSessionUser.mockResolvedValue(null);
});

const req = (body?: unknown) =>
  (new Request('http://localhost/api/notifications/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }) as never);
const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

describe('PATCH /api/notifications/[id]', () => {
  it('401 when unauthenticated', async () => {
    const n = { id: nextId(), userId: 'u1', read: false };
    notifications.push(n);
    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const res = await PATCH(req({ read: true }), p({ id: n.id }));
    expect(res.status).toBe(401);
  });

  it('404 for someone else\'s notification', async () => {
    const n = { id: nextId(), userId: 'owner1', read: false };
    notifications.push(n);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const res = await PATCH(req({ read: true }), p({ id: n.id }));
    expect(res.status).toBe(404);
  });

  it('marks a notification read', async () => {
    const n = { id: nextId(), userId: 'u1', read: false };
    notifications.push(n);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const res = await PATCH(req({ read: true }), p({ id: n.id }));
    expect(res.status).toBe(200);
    expect(notifications[0].read).toBe(true);
  });

  it('dismissing sets dismissedAt; un-dismissing clears it', async () => {
    const n = { id: nextId(), userId: 'u1', read: false, dismissedAt: null };
    notifications.push(n);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    await PATCH(req({ dismissed: true }), p({ id: n.id }));
    expect(notifications[0].dismissedAt).toBeInstanceOf(Date);
    await PATCH(req({ dismissed: false }), p({ id: n.id }));
    expect(notifications[0].dismissedAt).toBeNull();
  });
});
