import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Focused coverage for /api/tasks/[id] (PUT/DELETE) - previously 0%. This
 * route is large (calendar-slot recreation, blocked-on notifications), so
 * these tests target the parts that matter most for a pre-launch audit: the
 * authorization gate (canManageTask - a task's own owner, or whoever can
 * edit its team project) and the basic update/delete happy paths. The
 * calendar-event slot-recreation branches are not a security surface and
 * are intentionally left for a follow-up pass.
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock('@/lib/notify', () => ({ createNotification: vi.fn() }));

let seq = 0;
const nextId = () => `id${++seq}`;

const tasks: any[] = [];
const projects: any[] = [];
const teamMemberships: any[] = [];
const projectCollaborators: any[] = [];
const calendarEvents: any[] = [];
const users: any[] = [];

const db = {
  task: {
    findUnique: async ({ where }: any) => tasks.find((t) => t.id === where.id) ?? null,
    update: async ({ where, data }: any) => {
      const t = tasks.find((r) => r.id === where.id);
      Object.assign(t, data);
      return t;
    },
    delete: async ({ where }: any) => {
      const idx = tasks.findIndex((t) => t.id === where.id);
      const [row] = tasks.splice(idx, 1);
      return row;
    },
  },
  project: {
    findUnique: async ({ where }: any) => projects.find((p) => p.id === where.id) ?? null,
  },
  teamMembership: {
    findMany: async ({ where }: any = {}) =>
      teamMemberships.filter((m) => (!where.teamId || m.teamId === where.teamId) && (!where.userId || m.userId === where.userId)),
  },
  projectCollaborator: {
    findMany: async ({ where }: any = {}) =>
      projectCollaborators.filter((c) => (!where.projectId || c.projectId === where.projectId) && (!where.userId || c.userId === where.userId)),
  },
  calendarEvent: {
    findMany: async () => calendarEvents,
    create: async ({ data }: any) => { const row = { id: nextId(), ...data }; calendarEvents.push(row); return row; },
    update: async ({ where, data }: any) => { const e = calendarEvents.find((c) => c.id === where.id); Object.assign(e, data); return e; },
    delete: async ({ where }: any) => { const idx = calendarEvents.findIndex((c) => c.id === where.id); calendarEvents.splice(idx, 1); },
  },
  user: {
    findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
  },
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [tasks, projects, teamMemberships, projectCollaborators, calendarEvents, users]) arr.length = 0;
  seq = 0;
}

function seedTask(overrides: Partial<Record<string, unknown>> = {}) {
  const task = {
    id: nextId(),
    name: 'Run simulation',
    detail: '',
    userId: 'owner1',
    projectId: null,
    status: 'PENDING',
    date: new Date(),
    ...overrides,
  };
  tasks.push(task);
  return task;
}

const req = (body?: unknown) =>
  (new Request('http://localhost/api/tasks/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }) as never);

const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('PUT /api/tasks/[id]', () => {
  it('401 when unauthenticated', async () => {
    const task = seedTask();
    const { PUT } = await import('@/app/api/tasks/[id]/route');
    const res = await PUT(req({ name: 'x' }), p({ id: task.id }));
    expect(res.status).toBe(401);
  });

  it('404 for someone who neither owns the task nor can edit its project', async () => {
    const task = seedTask({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const { PUT } = await import('@/app/api/tasks/[id]/route');
    const res = await PUT(req({ name: 'Hacked' }), p({ id: task.id }));
    expect(res.status).toBe(404);
    expect(tasks[0].name).toBe('Run simulation');
  });

  it('the owner can update their own task', async () => {
    const task = seedTask({ userId: 'u1' });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { PUT } = await import('@/app/api/tasks/[id]/route');
    const res = await PUT(req({ name: 'Updated name', status: 'IN_PROGRESS' }), p({ id: task.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated name');
    expect(body.status).toBe('IN_PROGRESS');
  });

  it('a Team Leader with edit rights on the task\'s project can manage a teammate\'s assigned task', async () => {
    const team = { id: nextId(), name: 'Lab' };
    teamMemberships.push({ id: nextId(), teamId: team.id, userId: 'leader1', role: 'TEAM_LEADER' });
    const project = { id: nextId(), userId: 'someone', teamId: team.id };
    projects.push(project);
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'leader1' });
    const task = seedTask({ userId: 'assignee1', projectId: project.id });

    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { PUT } = await import('@/app/api/tasks/[id]/route');
    const res = await PUT(req({ status: 'COMPLETED' }), p({ id: task.id }));
    expect(res.status).toBe(200);
  });

  it('a plain Member collaborator cannot manage a teammate\'s task on the same project', async () => {
    const team = { id: nextId(), name: 'Lab' };
    teamMemberships.push({ id: nextId(), teamId: team.id, userId: 'member1', role: 'MEMBER' });
    const project = { id: nextId(), userId: 'someone', teamId: team.id };
    projects.push(project);
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'member1' });
    const task = seedTask({ userId: 'assignee1', projectId: project.id });

    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { PUT } = await import('@/app/api/tasks/[id]/route');
    const res = await PUT(req({ status: 'COMPLETED' }), p({ id: task.id }));
    expect(res.status).toBe(404);
  });
});

describe('GET and PATCH /api/tasks/[id] (FUNC-01)', () => {
  it('GET: 401 signed out, 404 for someone else\'s task, 200 for the owner', async () => {
    const task = seedTask({ userId: 'u1' });
    const { GET } = await import('@/app/api/tasks/[id]/route');
    expect((await GET(req(), p({ id: task.id }))).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    expect((await GET(req(), p({ id: task.id }))).status).toBe(404);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const res = await GET(req(), p({ id: task.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Run simulation');
  });

  it('PATCH updates only the fields sent, with the same ownership rule as PUT', async () => {
    const task = seedTask({ userId: 'u1' });
    const { PATCH } = await import('@/app/api/tasks/[id]/route');
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    expect((await PATCH(req({ name: 'Hacked' }), p({ id: task.id }))).status).toBe(404);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const res = await PATCH(req({ status: 'COMPLETED' }), p({ id: task.id }));
    expect(res.status).toBe(200);
    expect(tasks[0]).toMatchObject({ name: 'Run simulation', status: 'COMPLETED' });
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('404 for someone with no access', async () => {
    const task = seedTask({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const { DELETE } = await import('@/app/api/tasks/[id]/route');
    const res = await DELETE(req(), p({ id: task.id }));
    expect(res.status).toBe(404);
    expect(tasks).toHaveLength(1);
  });

  it('the owner can delete their own task, and its calendar events go with it', async () => {
    const task = seedTask({ userId: 'u1' });
    calendarEvents.push({ id: nextId(), userId: 'u1', taskId: task.id, googleEventId: null });
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { DELETE } = await import('@/app/api/tasks/[id]/route');
    const res = await DELETE(req(), p({ id: task.id }));
    expect(res.status).toBe(200);
    expect(tasks).toHaveLength(0);
    expect(calendarEvents).toHaveLength(0);
  });
});
