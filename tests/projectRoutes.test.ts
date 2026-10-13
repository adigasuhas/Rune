import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-style tests for Project CRUD and collaborator management -
 * the other headline feature area the pre-launch audit flagged at 0% route
 * coverage. Same in-memory-fake-db approach as tests/teamRoutes.test.ts:
 * `@/lib/teams` (canViewProject, canEditProject, getMembership) runs for
 * real against the fake store, so these tests exercise the actual
 * authorization logic, not just mock call assertions.
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

const projects: any[] = [];
const teams: any[] = [];
const teamMemberships: any[] = [];
const projectCollaborators: any[] = [];
const tasks: any[] = [];
const users: any[] = [];
const notebooks: any[] = [];
const notebookPages: any[] = [];

const db = {
  project: makeModel(projects),
  team: makeModel(teams),
  teamMembership: makeModel(teamMemberships),
  projectCollaborator: makeModel(projectCollaborators),
  task: makeModel(tasks),
  user: makeModel(users),
  notebook: makeModel(notebooks),
  notebookPage: makeModel(notebookPages),
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [projects, teams, teamMemberships, projectCollaborators, tasks, users, notebooks, notebookPages]) {
    arr.length = 0;
  }
  seq = 0;
}

function seedTeam(ownerId: string) {
  const team = { id: nextId(), name: 'Lab', ownerId };
  teams.push(team);
  teamMemberships.push({ id: nextId(), teamId: team.id, userId: ownerId, role: 'OWNER', joinedAt: new Date() });
  return team;
}

function addMember(teamId: string, userId: string, role: 'TEAM_LEADER' | 'MEMBER') {
  teamMemberships.push({ id: nextId(), teamId, userId, role, joinedAt: new Date() });
}

function seedProject(overrides: Partial<Record<string, unknown>> = {}) {
  const project = {
    id: nextId(),
    name: 'Rigidity of amorphous solids',
    userId: 'creator1',
    teamId: null,
    visibleToSubgroup: false,
    ...overrides,
  };
  projects.push(project);
  return project;
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

describe('GET /api/projects (list)', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/projects/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists personal projects plus team projects the caller owns, but not an unrelated team\'s project', async () => {
    seedProject({ userId: 'u1', name: 'My personal project' });
    const myTeam = seedTeam('u1');
    seedProject({ userId: 'someone-else', teamId: myTeam.id, name: 'Team project I own via the team' });
    const otherTeam = seedTeam('stranger');
    seedProject({ userId: 'stranger', teamId: otherTeam.id, name: 'Not mine' });

    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.map((p: any) => p.name).sort();
    expect(names).toEqual(['My personal project', 'Team project I own via the team']);
  });

  it('a collaborator sees the project they were added to', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'collab1', 'MEMBER');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'collab1' });

    getSessionUser.mockResolvedValue({ userId: 'collab1' });
    const { GET } = await import('@/app/api/projects/route');
    const res = await GET();
    const body = await res.json();
    expect(body.map((p: any) => p.id)).toContain(project.id);
  });
});

describe('POST /api/projects (create)', () => {
  it('400 when name is missing', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('a plain member cannot create a team-scoped project', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { POST } = await import('@/app/api/projects/route');
    const res = await POST(req({ name: 'New project', teamId: team.id }));
    expect(res.status).toBe(403);
  });

  it('a team leader can create a team-scoped project', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { POST } = await import('@/app/api/projects/route');
    const res = await POST(req({ name: 'New project', teamId: team.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teamId).toBe(team.id);
  });

  it('creates a personal project with no team', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/projects/route');
    const res = await POST(req({ name: 'Solo project' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
    expect(body.teamId).toBeNull();
  });
});

describe('GET /api/projects/[id]', () => {
  it('404 for someone with no access', async () => {
    const project = seedProject({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const { GET } = await import('@/app/api/projects/[id]/route');
    const res = await GET(req(), p({ id: project.id }));
    expect(res.status).toBe(404);
  });

  it('the creator can view their own project', async () => {
    const project = seedProject({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { GET } = await import('@/app/api/projects/[id]/route');
    const res = await GET(req(), p({ id: project.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canEdit).toBe(true);
  });

  it('a Team Leader collaborator can view but a plain Member collaborator cannot edit', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'leader1' });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'member1' });

    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { GET } = await import('@/app/api/projects/[id]/route');
    const leaderRes = await GET(req(), p({ id: project.id }));
    expect((await leaderRes.json()).canEdit).toBe(true);

    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const memberRes = await GET(req(), p({ id: project.id }));
    expect(memberRes.status).toBe(200);
    expect((await memberRes.json()).canEdit).toBe(false);
  });
});

describe('PUT /api/projects/[id]', () => {
  it('404 (not 403) for someone with no edit access - doesn\'t leak that the project exists', async () => {
    const project = seedProject({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const { PUT } = await import('@/app/api/projects/[id]/route');
    const res = await PUT(req({ name: 'Renamed' }), p({ id: project.id }));
    expect(res.status).toBe(404);
    expect(projects.find((pr) => pr.id === project.id)?.name).toBe('Rigidity of amorphous solids');
  });

  it('the creator can update their project', async () => {
    const project = seedProject({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { PUT } = await import('@/app/api/projects/[id]/route');
    const res = await PUT(req({ name: 'Renamed', status: 'ON_HOLD' }), p({ id: project.id }));
    expect(res.status).toBe(200);
    expect(projects.find((pr) => pr.id === project.id)).toMatchObject({ name: 'Renamed', status: 'ON_HOLD' });
  });

  it('visibleToSubgroup is ignored on a personal (non-team) project', async () => {
    const project = seedProject({ userId: 'owner1', teamId: null });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { PUT } = await import('@/app/api/projects/[id]/route');
    await PUT(req({ visibleToSubgroup: true }), p({ id: project.id }));
    expect(projects.find((pr) => pr.id === project.id)?.visibleToSubgroup).toBe(false);
  });
});

describe('DELETE /api/projects/[id]', () => {
  it('a Team Leader collaborator (who can edit) still cannot delete - only the creator or team OWNER can', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    const project = seedProject({ userId: 'someone', teamId: team.id });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'leader1' });

    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { DELETE } = await import('@/app/api/projects/[id]/route');
    const res = await DELETE(req(), p({ id: project.id }));
    expect(res.status).toBe(404);
    expect(projects).toHaveLength(1);
  });

  it('the team owner can delete a team project even if they didn\'t create it', async () => {
    const team = seedTeam('owner1');
    const project = seedProject({ userId: 'someone-else', teamId: team.id });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/projects/[id]/route');
    const res = await DELETE(req(), p({ id: project.id }));
    expect(res.status).toBe(200);
    expect(projects).toHaveLength(0);
  });

  it('the creator can delete their own project', async () => {
    const project = seedProject({ userId: 'owner1' });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/projects/[id]/route');
    const res = await DELETE(req(), p({ id: project.id }));
    expect(res.status).toBe(200);
    expect(projects).toHaveLength(0);
  });
});

describe('project collaborators', () => {
  it('adding a collaborator is rejected on a personal project', async () => {
    const project = seedProject({ userId: 'owner1', teamId: null });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/projects/[id]/collaborators/route');
    const res = await POST(req({ userId: 'someone' }), p({ id: project.id }));
    expect(res.status).toBe(400);
  });

  it('cannot add someone who isn\'t a member of the project\'s team', async () => {
    const team = seedTeam('owner1');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/projects/[id]/collaborators/route');
    const res = await POST(req({ userId: 'not-a-team-member' }), p({ id: project.id }));
    expect(res.status).toBe(400);
  });

  it('the owner adds a team member as a collaborator', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/projects/[id]/collaborators/route');
    const res = await POST(req({ userId: 'member1' }), p({ id: project.id }));
    expect(res.status).toBe(200);
    expect(projectCollaborators).toHaveLength(1);
  });

  it('a plain member collaborator cannot add another collaborator (no edit rights)', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    addMember(team.id, 'member2', 'MEMBER');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'member1' });

    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { POST } = await import('@/app/api/projects/[id]/collaborators/route');
    const res = await POST(req({ userId: 'member2' }), p({ id: project.id }));
    expect(res.status).toBe(404);
  });

  it('removes a collaborator', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    const project = seedProject({ userId: 'owner1', teamId: team.id });
    projectCollaborators.push({ id: nextId(), projectId: project.id, userId: 'member1' });

    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/projects/[id]/collaborators/route');
    const res = await DELETE(req(undefined, `http://localhost/api/projects/${project.id}/collaborators?userId=member1`), p({ id: project.id }));
    expect(res.status).toBe(200);
    expect(projectCollaborators).toHaveLength(0);
  });
});
