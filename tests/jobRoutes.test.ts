import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/jobs and /api/jobs/[id] (GET/POST/PUT/DELETE) - previously 0%. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;

const jobs: any[] = [];
const notebookPages: any[] = [];
const notebooks: any[] = [];
const tasks: any[] = [];
const instruments: any[] = [];
const memberships: any[] = [];

const db = {
  job: {
    findMany: async ({ where }: any = {}) =>
      jobs.filter((j) => (!where?.userId || j.userId === where.userId)),
    findUnique: async ({ where }: any) => jobs.find((j) => j.id === where.id) ?? null,
    create: async ({ data }: any) => {
      const row = { id: nextId(), createdAt: new Date().toISOString(), ...data };
      jobs.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const job = jobs.find((j) => j.id === where.id);
      if (!job) throw new Error('not found');
      Object.assign(job, data);
      return job;
    },
    delete: async ({ where }: any) => {
      const idx = jobs.findIndex((j) => j.id === where.id);
      if (idx === -1) throw new Error('not found');
      const [row] = jobs.splice(idx, 1);
      return row;
    },
  },
  notebookPage: {
    findUnique: async ({ where }: any) => notebookPages.find((p) => p.id === where.id) ?? null,
    findMany: async ({ where }: any = {}) =>
      notebookPages
        .filter((p) => !where?.id?.in || where.id.in.includes(p.id))
        .map((p) => ({ ...p, notebook: notebooks.find((n) => n.id === p.notebookId) })),
  },
  notebook: {
    findUnique: async ({ where }: any) => notebooks.find((n) => n.id === where.id) ?? null,
  },
  task: {
    findUnique: async ({ where }: any) => tasks.find((t) => t.id === where.id) ?? null,
  },
  instrument: {
    findUnique: async ({ where }: any) => instruments.find((i) => i.id === where.id) ?? null,
  },
  teamMembership: {
    findFirst: async ({ where }: any) =>
      memberships.find((m) => m.userId === where.userId && m.teamId === where.teamId) ?? null,
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [jobs, notebookPages, notebooks, tasks, instruments, memberships]) arr.length = 0;
  seq = 0;
}

const req = (body?: unknown) =>
  (new Request('http://localhost/api/jobs', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('GET /api/jobs (list)', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/jobs/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s own jobs, scoped away from another user\'s', async () => {
    jobs.push({ id: nextId(), userId: 'u1', name: 'My run', category: 'General', attempts: [] });
    jobs.push({ id: nextId(), userId: 'u2', name: 'Not mine', category: 'General', attempts: [] });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/jobs/route');
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('My run');
  });

  it('attaches the linked notebook\'s title, not the page\'s own static title', async () => {
    const notebook = { id: nextId(), userId: 'u1', title: 'Lab Notebook' };
    notebooks.push(notebook);
    const page = { id: nextId(), notebookId: notebook.id, title: 'Notebook' };
    notebookPages.push(page);
    jobs.push({ id: nextId(), userId: 'u1', name: 'Run with link', category: 'General', notebookPageId: page.id, attempts: [] });

    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/jobs/route');
    const res = await GET();
    const body = await res.json();
    expect(body[0].notebookPageTitle).toBe('Lab Notebook');
  });
});

describe('POST /api/jobs (create)', () => {
  it('400 when name is missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/jobs/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('creates a job with sensible defaults', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/jobs/route');
    const res = await POST(req({ name: 'MD simulation' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(body.category).toBe('General');
    expect(body.status).toBe('Queued');
    expect(body.isCpu).toBe(true);
  });

  it('a notebookPageId pointing at another user\'s notebook is silently dropped, not linked', async () => {
    const notebook = { id: nextId(), userId: 'someone-else', title: 'Not mine' };
    notebooks.push(notebook);
    const page = { id: nextId(), notebookId: notebook.id, title: 'Notebook' };
    notebookPages.push(page);

    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/jobs/route');
    const res = await POST(req({ name: 'Run', notebookPageId: page.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notebookPageId).toBeNull();
  });
});

describe('GET /api/jobs/[id]', () => {
  it('404 for a job you don\'t own', async () => {
    const job = { id: nextId(), userId: 'owner1', name: 'Not mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { GET } = await import('@/app/api/jobs/[id]/route');
    const res = await GET(req(), p({ id: job.id }));
    expect(res.status).toBe(404);
  });

  it('200 for the owner', async () => {
    const job = { id: nextId(), userId: 'u1', name: 'Mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/jobs/[id]/route');
    const res = await GET(req(), p({ id: job.id }));
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/jobs/[id]', () => {
  it('404 for a job you don\'t own', async () => {
    const job = { id: nextId(), userId: 'owner1', name: 'Not mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ status: 'Completed' }), p({ id: job.id }));
    expect(res.status).toBe(404);
    expect(jobs[0].status).toBeUndefined();
  });

  it('the owner can update status and other fields', async () => {
    const job = { id: nextId(), userId: 'u1', name: 'Mine', status: 'Queued', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ status: 'Running', computeTime: 45 }), p({ id: job.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('Running');
    expect(body.computeTime).toBe(45);
  });

  it('400 on invalid input', async () => {
    const job = { id: nextId(), userId: 'u1', name: 'Mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ name: '' }), p({ id: job.id }));
    expect(res.status).toBe(400);
  });
});

describe('job links can\'t point at another user\'s task or instrument (SEC-02)', () => {
  beforeEach(() => {
    tasks.push({ id: 'my-task', userId: 'u1' }, { id: 'their-task', userId: 'u2' });
    instruments.push(
      { id: 'my-inst', userId: 'u1', teamId: null },
      { id: 'their-private-inst', userId: 'u2', teamId: null },
      { id: 'team-inst', userId: 'u2', teamId: 'team1' },
      { id: 'other-team-inst', userId: 'u2', teamId: 'team2' },
    );
    memberships.push({ userId: 'u1', teamId: 'team1' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
  });

  it('create: rejects another user\'s task with 400 and stores nothing', async () => {
    const { POST } = await import('@/app/api/jobs/route');
    const res = await POST(req({ name: 'Run', taskId: 'their-task' }));
    expect(res.status).toBe(400);
    expect(jobs).toHaveLength(0);
  });

  it('create: rejects a private or other-team instrument with 400', async () => {
    const { POST } = await import('@/app/api/jobs/route');
    expect((await POST(req({ name: 'Run', instrumentId: 'their-private-inst' }))).status).toBe(400);
    expect((await POST(req({ name: 'Run', instrumentId: 'other-team-inst' }))).status).toBe(400);
    expect((await POST(req({ name: 'Run', instrumentId: 'no-such-inst' }))).status).toBe(400);
    expect(jobs).toHaveLength(0);
  });

  it('create: links your own task, your own instrument, and your team\'s shared instrument', async () => {
    const { POST } = await import('@/app/api/jobs/route');
    const a = await POST(req({ name: 'Run', taskId: 'my-task', instrumentId: 'my-inst' }));
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ taskId: 'my-task', instrumentId: 'my-inst' });
    const b = await POST(req({ name: 'Run', instrumentId: 'team-inst' }));
    expect((await b.json()).instrumentId).toBe('team-inst');
  });

  it('update: rejects switching to another user\'s task, leaving the job unchanged', async () => {
    jobs.push({ id: 'j1', userId: 'u1', name: 'Mine', taskId: 'my-task', instrumentId: null, attempts: [] });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ taskId: 'their-task' }), p({ id: 'j1' }));
    expect(res.status).toBe(400);
    expect(jobs[0].taskId).toBe('my-task');
  });

  it('update: an unchanged link isn\'t re-checked, so other edits still save', async () => {
    // e.g. a run on an instrument from a team the user has since left
    jobs.push({ id: 'j2', userId: 'u1', name: 'Old run', taskId: null, instrumentId: 'other-team-inst', attempts: [] });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ instrumentId: 'other-team-inst', status: 'Completed' }), p({ id: 'j2' }));
    expect(res.status).toBe(200);
    expect(jobs[0].status).toBe('Completed');
  });

  it('update: clearing a link is always allowed', async () => {
    jobs.push({ id: 'j3', userId: 'u1', name: 'Mine', taskId: 'my-task', instrumentId: 'my-inst', attempts: [] });
    const { PUT } = await import('@/app/api/jobs/[id]/route');
    const res = await PUT(req({ taskId: null, instrumentId: null }), p({ id: 'j3' }));
    expect(res.status).toBe(200);
    expect(jobs[0]).toMatchObject({ taskId: null, instrumentId: null });
  });
});

describe('DELETE /api/jobs/[id]', () => {
  it('404 for a job you don\'t own', async () => {
    const job = { id: nextId(), userId: 'owner1', name: 'Not mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { DELETE } = await import('@/app/api/jobs/[id]/route');
    const res = await DELETE(req(), p({ id: job.id }));
    expect(res.status).toBe(404);
    expect(jobs).toHaveLength(1);
  });

  it('the owner can delete their own job', async () => {
    const job = { id: nextId(), userId: 'u1', name: 'Mine', attempts: [] };
    jobs.push(job);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/jobs/[id]/route');
    const res = await DELETE(req(), p({ id: job.id }));
    expect(res.status).toBe(200);
    expect(jobs).toHaveLength(0);
  });
});
