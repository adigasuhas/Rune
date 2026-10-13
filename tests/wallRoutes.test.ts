import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Covers /api/projects/[id]/wall and /wall/[noteId] - previously 0%. */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

let seq = 0;
const nextId = () => `id${++seq}`;

const projects: any[] = [];
const wallNotes: any[] = [];

const db = {
  project: {
    findUnique: async ({ where }: any) => projects.find((p) => p.id === where.id) ?? null,
  },
  wallNote: {
    findMany: async ({ where }: any = {}) => wallNotes.filter((n) => !where?.projectId || n.projectId === where.projectId),
    findUnique: async ({ where }: any) => wallNotes.find((n) => n.id === where.id) ?? null,
    create: async ({ data }: any) => {
      const row = { id: nextId(), ...data };
      wallNotes.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const n = wallNotes.find((x) => x.id === where.id);
      if (!n) throw new Error('not found');
      Object.assign(n, data);
      return n;
    },
    delete: async ({ where }: any) => {
      const idx = wallNotes.findIndex((n) => n.id === where.id);
      if (idx === -1) throw new Error('not found');
      const [row] = wallNotes.splice(idx, 1);
      return row;
    },
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  projects.length = 0;
  wallNotes.length = 0;
  seq = 0;
}

const req = (body?: unknown, method?: string) =>
  (new Request('http://localhost/api/x', {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);
const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('GET/POST /api/projects/[id]/wall', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/projects/[id]/wall/route');
    const res = await GET(req(), p({ id: 'x' }));
    expect(res.status).toBe(401);
  });

  it('404 for a project you don\'t own', async () => {
    const project = { id: nextId(), userId: 'owner1', name: 'Not mine' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { GET } = await import('@/app/api/projects/[id]/wall/route');
    const res = await GET(req(), p({ id: project.id }));
    expect(res.status).toBe(404);
  });

  it('creates a note with defaults, stacked above existing notes', async () => {
    const project = { id: nextId(), userId: 'u1', name: 'Mine' };
    projects.push(project);
    wallNotes.push({ id: nextId(), projectId: project.id, userId: 'u1', zIndex: 3, text: 'existing' });

    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/[id]/wall/route');
    const res = await POST(req({ text: 'A new idea' }), p({ id: project.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('A new idea');
    expect(body.color).toBe('#FDE68A');
    expect(body.zIndex).toBe(4); // stacked above the existing note's zIndex 3
  });

  it('an invalid size falls back to MEDIUM', async () => {
    const project = { id: nextId(), userId: 'u1', name: 'Mine' };
    projects.push(project);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/[id]/wall/route');
    const res = await POST(req({ text: 'x', size: 'HUGE' }), p({ id: project.id }));
    const body = await res.json();
    expect(body.size).toBe('MEDIUM');
  });
});

describe('PUT/DELETE /api/projects/[id]/wall/[noteId]', () => {
  it('404 for a note belonging to a different project or user', async () => {
    const note = { id: nextId(), projectId: 'proj1', userId: 'owner1', text: 'x', zIndex: 1 };
    wallNotes.push(note);
    getSessionUser.mockResolvedValue({ userId: 'someone-else' });
    const { PUT } = await import('@/app/api/projects/[id]/wall/[noteId]/route');
    const res = await PUT(req({ text: 'hacked' }), p({ id: 'proj1', noteId: note.id }));
    expect(res.status).toBe(404);
    expect(wallNotes[0].text).toBe('x');
  });

  it('the owner can update note text/position', async () => {
    const note = { id: nextId(), projectId: 'proj1', userId: 'u1', text: 'x', x: 10, y: 10, zIndex: 1 };
    wallNotes.push(note);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/projects/[id]/wall/[noteId]/route');
    const res = await PUT(req({ text: 'updated', x: 50, y: 60 }), p({ id: 'proj1', noteId: note.id }));
    expect(res.status).toBe(200);
    expect(wallNotes[0]).toMatchObject({ text: 'updated', x: 50, y: 60 });
  });

  it('bringToFront raises zIndex above the current max', async () => {
    wallNotes.push({ id: nextId(), projectId: 'proj1', userId: 'u1', text: 'a', zIndex: 1 });
    const note2 = { id: nextId(), projectId: 'proj1', userId: 'u1', text: 'b', zIndex: 2 };
    wallNotes.push(note2);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/projects/[id]/wall/[noteId]/route');
    await PUT(req({ bringToFront: true }, 'PUT'), p({ id: 'proj1', noteId: wallNotes[0].id }));
    expect(wallNotes[0].zIndex).toBeGreaterThan(2);
  });

  it('the owner can delete their note', async () => {
    const note = { id: nextId(), projectId: 'proj1', userId: 'u1', text: 'x', zIndex: 1 };
    wallNotes.push(note);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/projects/[id]/wall/[noteId]/route');
    const res = await DELETE(req(undefined, 'DELETE'), p({ id: 'proj1', noteId: note.id }));
    expect(res.status).toBe(200);
    expect(wallNotes).toHaveLength(0);
  });
});
