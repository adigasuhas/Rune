import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "Ask for review" goes to one reviewer the owner picks. The picker only
 * lists eligible people, but these tests pin down that the server enforces
 * it too, and that a request reaches (and is queued for) only that person.
 */
const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getSessionUser: (...a: unknown[]) => getSessionUser(...a) }));

const createNotification = vi.fn();
vi.mock('@/lib/notify', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));

// Team leaders 'lead1' and 'lead2' can edit project p1; 'member' can only view it.
const editors = new Set(['owner-of-team', 'lead1', 'lead2']);
vi.mock('@/lib/teams', () => ({
  canViewProject: async () => true,
  canEditProject: async (_p: unknown, userId: string) => editors.has(userId),
}));

const users: Record<string, { id: string; name: string; email: string }> = {
  lead1: { id: 'lead1', name: 'Ines Duarte', email: 'ines@lab.test' },
  lead2: { id: 'lead2', name: 'Kofi Mensah', email: 'kofi@lab.test' },
  'owner-of-team': { id: 'owner-of-team', name: 'Prof. Hale', email: 'hale@lab.test' },
};
let page: any;
const db = {
  notebook: { findUnique: vi.fn(), findMany: vi.fn() },
  notebookPage: {
    findUnique: vi.fn(async () => page),
    update: vi.fn(async ({ data }: any) => (page = { ...page, ...data })),
  },
  project: { findUnique: vi.fn(async () => ({ id: 'p1', userId: 'owner-of-team', teamId: 't1' })), findMany: vi.fn() },
  team: { findUnique: vi.fn(async () => ({ id: 't1', ownerId: 'owner-of-team' })) },
  projectCollaborator: { findMany: vi.fn(async () => [{ userId: 'lead1' }, { userId: 'lead2' }, { userId: 'member' }]) },
  user: {
    findUnique: vi.fn(async ({ where }: any) => users[where.id] ?? { id: where.id, name: 'Asha', email: 'asha@lab.test' }),
    findMany: vi.fn(async ({ where }: any) => where.id.in.map((id: string) => users[id]).filter(Boolean)),
  },
  notebookComment: { findMany: vi.fn(async () => []) },
};
vi.mock('@/lib/db', () => ({ db }));

const notebook = { id: 'nb1', userId: 'asha', projectId: 'p1', title: 'Thin films' };
const put = (body: unknown) => new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'nb1', pageId: 'pg1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  editors.clear();
  ['owner-of-team', 'lead1', 'lead2'].forEach((id) => editors.add(id));
  page = { id: 'pg1', notebookId: 'nb1', title: 'Thin films', reviewStatus: 'NONE', reviewRequestedFromId: null };
  db.notebook.findUnique.mockResolvedValue(notebook);
  getSessionUser.mockResolvedValue({ userId: 'asha' });
});

describe('PUT review READY', () => {
  it('400 without a reviewer', async () => {
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const res = await PUT(put({ status: 'READY' }), params);
    expect(res.status).toBe(400);
    expect(db.notebookPage.update).not.toHaveBeenCalled();
  });

  it('400 for someone who cannot review this notebook (a plain member, or a stranger)', async () => {
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    for (const reviewerId of ['member', 'stranger', 'asha']) {
      const res = await PUT(put({ status: 'READY', reviewerId }), params);
      expect(res.status).toBe(400);
    }
    expect(db.notebookPage.update).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('stores the chosen reviewer and notifies only them', async () => {
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const res = await PUT(put({ status: 'READY', reviewerId: 'lead2' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).reviewRequestedFromId).toBe('lead2');
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ userId: 'lead2', type: 'NOTEBOOK_REVIEW_REQUESTED' });
  });

  it('withdrawing clears the reviewer', async () => {
    page.reviewStatus = 'READY';
    page.reviewRequestedFromId = 'lead1';
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const res = await PUT(put({ status: 'NONE' }), params);
    expect(res.status).toBe(200);
    expect(page.reviewRequestedFromId).toBeNull();
  });

  it('403 when someone other than the owner asks', async () => {
    getSessionUser.mockResolvedValue({ userId: 'lead1' });
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const res = await PUT(put({ status: 'READY', reviewerId: 'lead2' }), params);
    expect(res.status).toBe(403);
  });
});

describe('GET review (the picker)', () => {
  it('404 for anyone but the owner', async () => {
    getSessionUser.mockResolvedValue({ userId: 'lead1' });
    const { GET } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    expect((await GET(new Request('http://localhost/x'), params)).status).toBe(404);
  });

  it('lists only eligible reviewers, with why they qualify, never the owner or plain members', async () => {
    const { GET } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const body = await (await GET(new Request('http://localhost/x'), params)).json();
    expect(body.reviewers.map((r: any) => r.id).sort()).toEqual(['lead1', 'lead2', 'owner-of-team']);
    expect(body.reviewers.find((r: any) => r.id === 'owner-of-team').role).toBe('Team owner');
    expect(body.reviewers.find((r: any) => r.id === 'lead1')).toMatchObject({ name: 'Ines Duarte', email: 'ines@lab.test', role: 'Team leader' });
  });

  it('flags a requested reviewer who has since lost access', async () => {
    page.reviewStatus = 'READY';
    page.reviewRequestedFromId = 'lead2';
    editors.delete('lead2');
    const { GET } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const body = await (await GET(new Request('http://localhost/x'), params)).json();
    expect(body.requestedFrom).toMatchObject({ id: 'lead2', name: 'Kofi Mensah', eligible: false });
    expect(body.reviewers.map((r: any) => r.id)).not.toContain('lead2');
  });
});

describe('review queue', () => {
  it('a request sent to one reviewer is in their queue only', async () => {
    db.notebook.findMany.mockResolvedValue([{ ...notebook, page: { ...page, reviewStatus: 'READY', reviewRequestedFromId: 'lead1' } }]);
    db.project.findMany.mockResolvedValue([{ id: 'p1', name: 'Films', userId: 'owner-of-team', teamId: 't1' }]);
    const { GET } = await import('@/app/api/review-queue/route');
    getSessionUser.mockResolvedValue({ userId: 'lead1' });
    expect(await (await GET()).json()).toHaveLength(1);
    getSessionUser.mockResolvedValue({ userId: 'lead2' });
    expect(await (await GET()).json()).toHaveLength(0);
  });
});
