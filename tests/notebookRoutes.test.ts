import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-style tests for notebook core CRUD (list/create/get/update/
 * delete) - flagged 0% covered by the pre-launch audit alongside team and
 * project routes. Same in-memory-fake-db approach as
 * tests/teamRoutes.test.ts / tests/projectRoutes.test.ts.
 *
 * Note on scope, observed while writing these: unlike Project routes,
 * every notebook route below gates purely on `notebook.userId ===
 * session.userId` / `project.userId === session.userId` - there is no
 * canViewProject/canEditProject team check anywhere in the notebook API.
 * That's a real behavioral difference from Projects (a Team Leader
 * collaborator with edit rights on a team project still cannot create or
 * open a notebook inside it), which these tests assert as the *current*
 * behavior rather than silently "fixing" it - that's a product decision to
 * confirm with the team, not something to change under a test-coverage task.
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;

 
function matchWhere(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if (Array.isArray((v as { in?: unknown[] }).in)) return (v as { in: unknown[] }).in.includes(row?.[k]);
      return matchWhere(row?.[k], v);
    }
    return row?.[k] === v;
  });
}

 
function makeModel<T extends Record<string, any>>(rows: T[]) {
  return {
    findMany: async ({ where }: any = {}) => rows.filter((r) => matchWhere(r, where)),
    findUnique: async ({ where }: any) => {
      const keys = Object.keys(where || {});
      return rows.find((r) => keys.every((k) => r[k] === where[k])) ?? null;
    },
    count: async ({ where }: any = {}) => rows.filter((r) => matchWhere(r, where)).length,
    create: async ({ data }: any) => {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row as T);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error('record not found');
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: any) => {
      const idx = rows.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('record not found');
      const [row] = rows.splice(idx, 1);
      return row;
    },
  };
}

const notebooks: any[] = [];
const notebookPages: any[] = [];
const projects: any[] = [];

const db = {
  notebook: makeModel(notebooks),
  notebookPage: makeModel(notebookPages),
  project: makeModel(projects),
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [notebooks, notebookPages, projects]) arr.length = 0;
  seq = 0;
}

const req = (body?: unknown, url = 'http://localhost/api/x') =>
  (new Request(url, {
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

describe('GET /api/notebooks (list)', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/notebooks/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s own notebooks, with linked project metadata', async () => {
    const project = { id: nextId(), name: 'Rigidity project', color: '#333', userId: 'u1' };
    projects.push(project);
    notebooks.push({ id: nextId(), title: 'Mine', userId: 'u1', projectId: project.id, isPersonal: false });
    notebooks.push({ id: nextId(), title: 'Not mine', userId: 'u2', projectId: null, isPersonal: true });

    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/notebooks/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].project).toMatchObject({ name: 'Rigidity project' });
  });
});

describe('POST /api/notebooks (create)', () => {
  it('400 when title is missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/notebooks/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('404 when projectId points at a project the caller does not own', async () => {
    const project = { id: nextId(), name: 'Someone else\'s', userId: 'u2' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/notebooks/route');
    const res = await POST(req({ title: 'New notebook', projectId: project.id }));
    expect(res.status).toBe(404);
  });

  it('creates a personal notebook seeded with a single blank page', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/notebooks/route');
    const res = await POST(req({ title: 'Scratchpad' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(notebookPages.filter((pg) => pg.notebookId === body.id)).toHaveLength(1);
  });

  it('only a project\'s first notebook is seeded with the default lab-notebook section skeleton', async () => {
    const project = { id: nextId(), name: 'My project', userId: 'u1' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/notebooks/route');

    const first = await (await POST(req({ title: 'Notebook 1', projectId: project.id }))).json();
    const firstPage = notebookPages.find((pg) => pg.notebookId === first.id);
    expect(firstPage?.content?.length).toBeGreaterThan(0); // default section skeleton content

    const second = await (await POST(req({ title: 'Notebook 2', projectId: project.id }))).json();
    const secondPage = notebookPages.find((pg) => pg.notebookId === second.id);
    expect(secondPage?.content).toBe(''); // plain blank page, not the full skeleton
  });
});

describe('GET /api/notebooks/[id]', () => {
  it('404 for a notebook you don\'t own (including a teammate\'s team-project notebook)', async () => {
    const notebook = { id: nextId(), title: 'Not mine', userId: 'owner1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { GET } = await import('@/app/api/notebooks/[id]/route');
    const res = await GET(req(), p({ id: notebook.id }));
    expect(res.status).toBe(404);
  });

  it('200 for the owner, including the notebook\'s page', async () => {
    const notebook = { id: nextId(), title: 'Mine', userId: 'u1', projectId: null };
    notebooks.push(notebook);
    notebookPages.push({ id: nextId(), notebookId: notebook.id, title: 'Notebook', content: 'hello' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/notebooks/[id]/route');
    const res = await GET(req(), p({ id: notebook.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toMatchObject({ content: 'hello' });
  });
});

describe('PUT /api/notebooks/[id]', () => {
  it('404 for a notebook you don\'t own', async () => {
    const notebook = { id: nextId(), title: 'Not mine', userId: 'owner1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { PUT } = await import('@/app/api/notebooks/[id]/route');
    const res = await PUT(req({ title: 'Hacked title' }), p({ id: notebook.id }));
    expect(res.status).toBe(404);
    expect(notebooks[0].title).toBe('Not mine');
  });

  it('400 on an invalid body (Zod validation)', async () => {
    const notebook = { id: nextId(), title: 'Mine', userId: 'u1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/notebooks/[id]/route');
    const res = await PUT(req({ title: '' }), p({ id: notebook.id }));
    expect(res.status).toBe(400);
  });

  it('the owner can rename their notebook', async () => {
    const notebook = { id: nextId(), title: 'Old title', userId: 'u1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/notebooks/[id]/route');
    const res = await PUT(req({ title: 'New title' }), p({ id: notebook.id }));
    expect(res.status).toBe(200);
    expect(notebooks[0].title).toBe('New title');
  });

  it('cannot link to a project the caller does not own', async () => {
    const notebook = { id: nextId(), title: 'Mine', userId: 'u1', projectId: null };
    notebooks.push(notebook);
    const foreignProject = { id: nextId(), name: 'Not mine', userId: 'u2' };
    projects.push(foreignProject);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/notebooks/[id]/route');
    const res = await PUT(req({ projectId: foreignProject.id }), p({ id: notebook.id }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/notebooks/[id]', () => {
  it('404 for a notebook you don\'t own', async () => {
    const notebook = { id: nextId(), title: 'Not mine', userId: 'owner1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { DELETE } = await import('@/app/api/notebooks/[id]/route');
    const res = await DELETE(req(), p({ id: notebook.id }));
    expect(res.status).toBe(404);
    expect(notebooks).toHaveLength(1);
  });

  it('the owner can delete their notebook', async () => {
    const notebook = { id: nextId(), title: 'Mine', userId: 'u1', projectId: null };
    notebooks.push(notebook);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/notebooks/[id]/route');
    const res = await DELETE(req(), p({ id: notebook.id }));
    expect(res.status).toBe(200);
    expect(notebooks).toHaveLength(0);
  });
});
