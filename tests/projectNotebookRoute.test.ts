import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers POST /api/projects/[id]/notebook ("Open Notebook" from a project) - previously 0%. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock('@/lib/notebookDefaults', () => ({ seedProjectNotebookSections: vi.fn() }));

let seq = 0;
const nextId = () => `id${++seq}`;

const projects: any[] = [];
const notebooks: any[] = [];

const db = {
  project: { findUnique: async ({ where }: any) => projects.find((p) => p.id === where.id) ?? null },
  notebook: {
    findMany: async ({ where }: any = {}) => notebooks.filter((n) => !where?.projectId || n.projectId === where.projectId),
    create: async ({ data }: any) => {
      const row = { id: nextId(), ...data };
      notebooks.push(row);
      return row;
    },
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  projects.length = 0;
  notebooks.length = 0;
  seq = 0;
}

const req = () => (new Request('http://localhost/api/x', { method: 'POST' }) as never);
const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('POST /api/projects/[id]/notebook', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/projects/[id]/notebook/route');
    const res = await POST(req(), p({ id: 'x' }));
    expect(res.status).toBe(401);
  });

  it('404 for a project you don\'t own', async () => {
    const project = { id: nextId(), userId: 'owner1', name: 'Not mine' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { POST } = await import('@/app/api/projects/[id]/notebook/route');
    const res = await POST(req(), p({ id: project.id }));
    expect(res.status).toBe(404);
  });

  it('creates and seeds a notebook when the project has none yet', async () => {
    const project = { id: nextId(), userId: 'u1', name: 'My project' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/[id]/notebook/route');
    const res = await POST(req(), p({ id: project.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('notebook');
    expect(body.notebook.title).toContain('My project');
  });

  it('returns the single existing notebook directly (fast path)', async () => {
    const project = { id: nextId(), userId: 'u1', name: 'My project' };
    projects.push(project);
    notebooks.push({ id: nextId(), projectId: project.id, title: 'Existing notebook' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/[id]/notebook/route');
    const res = await POST(req(), p({ id: project.id }));
    const body = await res.json();
    expect(body.mode).toBe('notebook');
    expect(body.notebook.title).toBe('Existing notebook');
  });

  it('returns folder mode when the project already has more than one notebook', async () => {
    const project = { id: nextId(), userId: 'u1', name: 'My project' };
    projects.push(project);
    notebooks.push({ id: nextId(), projectId: project.id, title: 'One' });
    notebooks.push({ id: nextId(), projectId: project.id, title: 'Two' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/[id]/notebook/route');
    const res = await POST(req(), p({ id: project.id }));
    const body = await res.json();
    expect(body.mode).toBe('folder');
  });
});
