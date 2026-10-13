import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-style tests for the team-management API surface (invites,
 * membership, roles, sub-groups, ownership transfer, leave). Per the
 * pre-launch audit, this was the single largest untested area of the
 * codebase - the whole team-collaboration feature had 0% route coverage.
 *
 * Unlike tests/routes.test.ts (which mocks `db` per-call with
 * `mockResolvedValue`), this file backs `@/lib/db` with a small in-memory
 * fake that actually stores and filters rows. `src/lib/teams.ts` (getMembership,
 * canEditProject, removeMemberAndCleanup, ...) is NOT mocked, so these tests
 * exercise the real authorization logic end-to-end against that fake store,
 * not just "was the right function called."
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));

// --- minimal in-memory fake Prisma client -----------------------------
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

const teams: any[] = [];
const teamMemberships: any[] = [];
const teamInvites: any[] = [];
const teamSubgroupMembers: any[] = [];
const projectCollaborators: any[] = [];
const projects: any[] = [];
const tasks: any[] = [];
const users: any[] = [];

const db = {
  team: makeModel(teams),
  teamMembership: makeModel(teamMemberships),
  teamInvite: makeModel(teamInvites),
  teamSubgroupMember: makeModel(teamSubgroupMembers),
  projectCollaborator: makeModel(projectCollaborators),
  project: makeModel(projects),
  task: makeModel(tasks),
  user: makeModel(users),
};
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [teams, teamMemberships, teamInvites, teamSubgroupMembers, projectCollaborators, projects, tasks, users]) {
    arr.length = 0;
  }
  seq = 0;
}

function seedTeam(ownerId: string, name = 'Lab') {
  const team = { id: nextId(), name, ownerId, createdAt: new Date(), updatedAt: new Date() };
  teams.push(team);
  teamMemberships.push({ id: nextId(), teamId: team.id, userId: ownerId, role: 'OWNER', joinedAt: new Date() });
  return team;
}

function addMember(teamId: string, userId: string, role: 'TEAM_LEADER' | 'MEMBER') {
  const m = { id: nextId(), teamId, userId, role, joinedAt: new Date() };
  teamMemberships.push(m);
  return m;
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

describe('POST /api/teams (create)', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/teams/route');
    const res = await POST(req({ name: 'Lab' }));
    expect(res.status).toBe(401);
  });

  it('creates a team and makes the creator OWNER', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/teams/route');
    const res = await POST(req({ name: 'Lab' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.myRole).toBe('OWNER');
    expect(body.memberCount).toBe(1);
    expect(teamMemberships).toHaveLength(1);
    expect(teamMemberships[0]).toMatchObject({ userId: 'u1', role: 'OWNER' });
  });

  it('400 when name is blank', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/teams/route');
    const res = await POST(req({ name: '   ' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/teams (list mine)', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/teams/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists only teams the caller belongs to, with their role and member count', async () => {
    const teamA = seedTeam('owner1');
    addMember(teamA.id, 'u1', 'MEMBER');
    seedTeam('someoneElse'); // u1 is not a member of this one
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/teams/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: teamA.id, myRole: 'MEMBER', memberCount: 2 });
  });
});

describe('GET /api/teams/[id]', () => {
  it('404 for a non-member', async () => {
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const team = seedTeam('owner1');
    const { GET } = await import('@/app/api/teams/[id]/route');
    const res = await GET(req(), p({ id: team.id }));
    expect(res.status).toBe(404);
  });

  it('200 for a member, with role and member list', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'member1' });
    users.push({ id: 'member1', name: 'Mem', email: 'm@lab.edu', avatarUrl: null });
    users.push({ id: 'owner1', name: 'Owner', email: 'o@lab.edu', avatarUrl: null });
    const { GET } = await import('@/app/api/teams/[id]/route');
    const res = await GET(req(), p({ id: team.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.myRole).toBe('MEMBER');
    expect(body.members).toHaveLength(2);
  });
});

describe('PUT/DELETE /api/teams/[id] (rename/delete)', () => {
  it('non-owner cannot rename the team', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { PUT } = await import('@/app/api/teams/[id]/route');
    const res = await PUT(req({ name: 'New Name' }), p({ id: team.id }));
    expect(res.status).toBe(403);
  });

  it('owner can rename the team', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { PUT } = await import('@/app/api/teams/[id]/route');
    const res = await PUT(req({ name: 'New Name' }), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teams.find((t) => t.id === team.id)?.name).toBe('New Name');
  });

  it('non-owner cannot delete the team', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { DELETE } = await import('@/app/api/teams/[id]/route');
    const res = await DELETE(req(), p({ id: team.id }));
    expect(res.status).toBe(403);
    expect(teams).toHaveLength(1);
  });

  it('owner can delete the team', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/teams/[id]/route');
    const res = await DELETE(req(), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teams).toHaveLength(0);
  });
});

describe('team invites', () => {
  it('a plain member cannot create invites', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { POST } = await import('@/app/api/teams/[id]/invites/route');
    const res = await POST(req({}), p({ id: team.id }));
    expect(res.status).toBe(403);
  });

  it('a team leader cannot create a TEAM_LEADER invite (owner-only escalation guard)', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { POST } = await import('@/app/api/teams/[id]/invites/route');
    const res = await POST(req({ role: 'TEAM_LEADER' }), p({ id: team.id }));
    expect(res.status).toBe(403);
  });

  it('a team leader can create a MEMBER invite', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { POST } = await import('@/app/api/teams/[id]/invites/route');
    const res = await POST(req({}), p({ id: team.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('MEMBER');
  });

  it('the owner can create a TEAM_LEADER invite', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/invites/route');
    const res = await POST(req({ role: 'TEAM_LEADER' }), p({ id: team.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('TEAM_LEADER');
  });

  it('revoking an invite from a different team 404s (cross-team IDOR guard)', async () => {
    const teamA = seedTeam('ownerA');
    const teamB = seedTeam('ownerB');
    const invite = teamInvites[0] || (await (async () => {
      const { POST } = await import('@/app/api/teams/[id]/invites/route');
      getSessionUser.mockResolvedValue({ userId: 'ownerB' });
      const res = await POST(req({}), p({ id: teamB.id }));
      return res.json();
    })());
    getSessionUser.mockResolvedValue({ userId: 'ownerA' });
    const { DELETE } = await import('@/app/api/teams/[id]/invites/[inviteId]/route');
    const res = await DELETE(req(), p({ id: teamA.id, inviteId: invite.id }));
    expect(res.status).toBe(404);
  });

  it('the owner can revoke their own team\'s invite', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/invites/route');
    const createRes = await POST(req({}), p({ id: team.id }));
    const invite = await createRes.json();

    const { DELETE } = await import('@/app/api/teams/[id]/invites/[inviteId]/route');
    const res = await DELETE(req(), p({ id: team.id, inviteId: invite.id }));
    expect(res.status).toBe(200);
    expect(teamInvites.find((i) => i.id === invite.id)?.revoked).toBe(true);
  });
});

describe('GET /api/teams/invites/[code] (preview)', () => {
  it('404 for an unknown code', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/teams/invites/[code]/route');
    const res = await GET(req(), p({ code: 'NOPE' }));
    expect(res.status).toBe(404);
  });

  it('shows team name, granted role, and whether the caller is already a member', async () => {
    const team = seedTeam('owner1', 'Amorphous Solids Lab');
    teamInvites.push({ id: nextId(), teamId: team.id, code: 'PREVIEWME', role: 'MEMBER', revoked: false, createdById: 'owner1', expiresAt: null });

    getSessionUser.mockResolvedValue({ userId: 'newperson' });
    const { GET } = await import('@/app/api/teams/invites/[code]/route');
    const res = await GET(req(), p({ code: 'PREVIEWME' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ teamName: 'Amorphous Solids Lab', role: 'MEMBER', alreadyMember: false });

    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const alreadyRes = await GET(req(), p({ code: 'PREVIEWME' }));
    expect((await alreadyRes.json()).alreadyMember).toBe(true);
  });
});

describe('redeeming an invite code', () => {
  it('404 for an unknown code', async () => {
    getSessionUser.mockResolvedValue({ userId: 'newperson' });
    const { POST } = await import('@/app/api/teams/invites/[code]/redeem/route');
    const res = await POST(req({}, 'http://localhost/api/teams/invites/BADCODE/redeem'), p({ code: 'BADCODE' }));
    expect(res.status).toBe(404);
  });

  it('404 for a revoked code', async () => {
    const team = seedTeam('owner1');
    teamInvites.push({ id: nextId(), teamId: team.id, code: 'REVOKED1', role: 'MEMBER', revoked: true, createdById: 'owner1', expiresAt: null });
    getSessionUser.mockResolvedValue({ userId: 'newperson' });
    const { POST } = await import('@/app/api/teams/invites/[code]/redeem/route');
    const res = await POST(req({}, 'http://localhost/api/teams/invites/REVOKED1/redeem'), p({ code: 'REVOKED1' }));
    expect(res.status).toBe(404);
  });

  it('creates a membership with the invite\'s granted role', async () => {
    const team = seedTeam('owner1');
    teamInvites.push({ id: nextId(), teamId: team.id, code: 'GOODCODE', role: 'TEAM_LEADER', revoked: false, createdById: 'owner1', expiresAt: null });
    getSessionUser.mockResolvedValue({ userId: 'newperson' });
    const { POST } = await import('@/app/api/teams/invites/[code]/redeem/route');
    const res = await POST(req({}, 'http://localhost/api/teams/invites/GOODCODE/redeem'), p({ code: 'GOODCODE' }));
    expect(res.status).toBe(200);
    const membership = teamMemberships.find((m) => m.userId === 'newperson' && m.teamId === team.id);
    expect(membership?.role).toBe('TEAM_LEADER');
  });

  it('409 when already a member', async () => {
    const team = seedTeam('owner1');
    teamInvites.push({ id: nextId(), teamId: team.id, code: 'GOODCODE2', role: 'MEMBER', revoked: false, createdById: 'owner1', expiresAt: null });
    getSessionUser.mockResolvedValue({ userId: 'owner1' }); // already the owner
    const { POST } = await import('@/app/api/teams/invites/[code]/redeem/route');
    const res = await POST(req({}, 'http://localhost/api/teams/invites/GOODCODE2/redeem'), p({ code: 'GOODCODE2' }));
    expect(res.status).toBe(409);
  });

  it('throttles repeated redemption attempts by the same caller (429 past the limit)', async () => {
    const team = seedTeam('owner1');
    teamInvites.push({ id: nextId(), teamId: team.id, code: 'RATELIMITED', role: 'MEMBER', revoked: false, createdById: 'owner1', expiresAt: null });
    getSessionUser.mockResolvedValue({ userId: 'rate-limit-test-user' });
    const { POST } = await import('@/app/api/teams/invites/[code]/redeem/route');
    const url = 'http://localhost/api/teams/invites/RATELIMITED/redeem';
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await POST(req({}, url), p({ code: 'RATELIMITED' }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('changing / removing a member', () => {
  it('only the owner can change a member\'s role', async () => {
    const team = seedTeam('owner1');
    const leader = addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { PUT } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await PUT(req({ role: 'TEAM_LEADER' }), p({ id: team.id, userId: 'member1' }));
    expect(res.status).toBe(403);
    void leader;
  });

  it('the owner role cannot be granted through this endpoint', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { PUT } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await PUT(req({ role: 'OWNER' }), p({ id: team.id, userId: 'member1' }));
    expect(res.status).toBe(400);
  });

  it('the owner promotes a member to TEAM_LEADER', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { PUT } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await PUT(req({ role: 'TEAM_LEADER' }), p({ id: team.id, userId: 'member1' }));
    expect(res.status).toBe(200);
    expect(teamMemberships.find((m) => m.userId === 'member1')?.role).toBe('TEAM_LEADER');
  });

  it('the owner cannot be removed via the member-removal endpoint', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    // Owner tries to remove themselves through this route (should be rejected regardless of caller).
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await DELETE(req(), p({ id: team.id, userId: 'owner1' }));
    expect(res.status).toBe(400);
  });

  it('non-owner cannot remove a member', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { DELETE } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await DELETE(req(), p({ id: team.id, userId: 'member1' }));
    expect(res.status).toBe(403);
  });

  it('the owner removes a member, cleaning up their sub-group entries', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    teamSubgroupMembers.push({ id: nextId(), teamId: team.id, teamLeaderId: 'leader1', memberId: 'member1' });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/teams/[id]/members/[userId]/route');
    const res = await DELETE(req(), p({ id: team.id, userId: 'member1' }));
    expect(res.status).toBe(200);
    expect(teamMemberships.find((m) => m.userId === 'member1')).toBeUndefined();
    expect(teamSubgroupMembers.find((s) => s.memberId === 'member1')).toBeUndefined();
  });
});

describe('POST /api/teams/[id]/leave', () => {
  it('404 when not a member', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'outsider' });
    const { POST } = await import('@/app/api/teams/[id]/leave/route');
    const res = await POST(req(), p({ id: team.id }));
    expect(res.status).toBe(404);
  });

  it('the owner cannot leave', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/leave/route');
    const res = await POST(req(), p({ id: team.id }));
    expect(res.status).toBe(400);
    expect(teamMemberships).toHaveLength(1);
  });

  it('a member can leave', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { POST } = await import('@/app/api/teams/[id]/leave/route');
    const res = await POST(req(), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teamMemberships.find((m) => m.userId === 'member1')).toBeUndefined();
  });
});

describe('POST /api/teams/[id]/transfer-ownership', () => {
  it('only the current owner can transfer ownership', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { POST } = await import('@/app/api/teams/[id]/transfer-ownership/route');
    const res = await POST(req({ newOwnerId: 'leader1' }), p({ id: team.id }));
    expect(res.status).toBe(403);
  });

  it('cannot transfer to someone who is not already a member', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/transfer-ownership/route');
    const res = await POST(req({ newOwnerId: 'stranger' }), p({ id: team.id }));
    expect(res.status).toBe(400);
  });

  it('cannot "transfer" to yourself', async () => {
    const team = seedTeam('owner1');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/transfer-ownership/route');
    const res = await POST(req({ newOwnerId: 'owner1' }), p({ id: team.id }));
    expect(res.status).toBe(400);
  });

  it('successfully hands ownership to another member; the old owner becomes a TEAM_LEADER', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/transfer-ownership/route');
    const res = await POST(req({ newOwnerId: 'member1' }), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teamMemberships.find((m) => m.userId === 'member1')?.role).toBe('OWNER');
    expect(teamMemberships.find((m) => m.userId === 'owner1')?.role).toBe('TEAM_LEADER');
    expect(teams.find((t) => t.id === team.id)?.ownerId).toBe('member1');
  });
});

describe('team sub-groups', () => {
  it('a plain member cannot assign anyone to a sub-group', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'member1' });
    const { POST } = await import('@/app/api/teams/[id]/subgroups/route');
    const res = await POST(req({ teamLeaderId: 'leader1', memberId: 'member1' }), p({ id: team.id }));
    expect(res.status).toBe(403);
  });

  it('a team leader can add a member to their own sub-group, but not someone else\'s', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'leader2', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'leader1' });
    const { POST } = await import('@/app/api/teams/[id]/subgroups/route');

    const ownGroup = await POST(req({ teamLeaderId: 'leader1', memberId: 'member1' }), p({ id: team.id }));
    expect(ownGroup.status).toBe(200);

    const othersGroup = await POST(req({ teamLeaderId: 'leader2', memberId: 'member1' }), p({ id: team.id }));
    expect(othersGroup.status).toBe(403);
  });

  it('the owner can assign any member to any leader\'s sub-group', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/subgroups/route');
    const res = await POST(req({ teamLeaderId: 'leader1', memberId: 'member1' }), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teamSubgroupMembers).toHaveLength(1);
  });

  it('rejects a teamLeaderId that is not actually a Team Leader', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'member1', 'MEMBER');
    addMember(team.id, 'member2', 'MEMBER');
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { POST } = await import('@/app/api/teams/[id]/subgroups/route');
    const res = await POST(req({ teamLeaderId: 'member1', memberId: 'member2' }), p({ id: team.id }));
    expect(res.status).toBe(400);
  });

  it('removes a sub-group assignment', async () => {
    const team = seedTeam('owner1');
    addMember(team.id, 'leader1', 'TEAM_LEADER');
    addMember(team.id, 'member1', 'MEMBER');
    teamSubgroupMembers.push({ id: nextId(), teamId: team.id, teamLeaderId: 'leader1', memberId: 'member1' });
    getSessionUser.mockResolvedValue({ userId: 'owner1' });
    const { DELETE } = await import('@/app/api/teams/[id]/subgroups/route');
    const res = await DELETE(req(undefined, `http://localhost/api/teams/${team.id}/subgroups?teamLeaderId=leader1&memberId=member1`), p({ id: team.id }));
    expect(res.status).toBe(200);
    expect(teamSubgroupMembers).toHaveLength(0);
  });
});
