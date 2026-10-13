import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Team RBAC decision functions. The DB is mocked so these are pure logic
 * tests of "who can see / edit / chat".
 */
const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    teamMembership: { findMany: (...a: unknown[]) => findMany('teamMembership', ...a) },
    projectCollaborator: { findMany: (...a: unknown[]) => findMany('projectCollaborator', ...a) },
    teamSubgroupMember: { findMany: (...a: unknown[]) => findMany('teamSubgroupMember', ...a) },
    team: { findMany: (...a: unknown[]) => findMany('team', ...a) },
  },
}));

import {
  isOwnerOrLeader,
  buildDirectConversationKey,
  generateInviteCode,
  canViewProject,
  canEditProject,
  canAccessDirectChat,
  canAccessTeamChat,
} from '@/lib/teams';

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
});

describe('pure helpers', () => {
  it('isOwnerOrLeader', () => {
    expect(isOwnerOrLeader('OWNER')).toBe(true);
    expect(isOwnerOrLeader('TEAM_LEADER')).toBe(true);
    expect(isOwnerOrLeader('MEMBER')).toBe(false);
  });

  it('direct conversation key is order-independent', () => {
    expect(buildDirectConversationKey('a', 'b')).toBe(buildDirectConversationKey('b', 'a'));
  });

  it('invite code is url-safe and non-trivial', () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(c.length).toBeGreaterThanOrEqual(6);
    expect(generateInviteCode()).not.toBe(c);
  });
});

describe('canViewProject / canEditProject', () => {
  const personalProject = { id: 'p', userId: 'owner', teamId: null };
  const teamProject = { id: 'p', userId: 'owner', teamId: 'team1' };

  it('creator can always view and edit', async () => {
    findMany.mockResolvedValue([]);
    expect(await canViewProject(personalProject, 'owner')).toBe(true);
    expect(await canEditProject(personalProject, 'owner')).toBe(true);
  });

  it('a stranger cannot view a personal project', async () => {
    findMany.mockResolvedValue([]); // no memberships, no collaborations
    expect(await canViewProject(personalProject, 'stranger')).toBe(false);
    expect(await canEditProject(personalProject, 'stranger')).toBe(false);
  });

  it('a team owner sees every team project', async () => {
    findMany.mockImplementation((table: string) =>
      table === 'teamMembership' ? Promise.resolve([{ role: 'OWNER' }]) : Promise.resolve([])
    );
    expect(await canViewProject(teamProject, 'teamOwner')).toBe(true);
    expect(await canEditProject(teamProject, 'teamOwner')).toBe(true);
  });

  it('a plain collaborator can view but not edit', async () => {
    findMany.mockImplementation((table: string) => {
      if (table === 'teamMembership') return Promise.resolve([{ role: 'MEMBER' }]);
      if (table === 'projectCollaborator') return Promise.resolve([{ projectId: 'p', userId: 'collab' }]);
      return Promise.resolve([]);
    });
    expect(await canViewProject(teamProject, 'collab')).toBe(true);
    expect(await canEditProject(teamProject, 'collab')).toBe(false);
  });

  it('a team leader gets NO access to a shared project unless it opts in', async () => {
    findMany.mockImplementation((table: string) => {
      if (table === 'teamMembership') return Promise.resolve([{ role: 'TEAM_LEADER' }]);
      return Promise.resolve([]); // not a collaborator, no subgroup rows
    });
    // visibleToSubgroup undefined/false -> still no access
    expect(await canViewProject(teamProject, 'leader')).toBe(false);
  });

  it('visibleToSubgroup grants a leader read access when one of their members is on the project', async () => {
    findMany.mockImplementation((table: string, arg: any) => {
      if (table === 'teamMembership') return Promise.resolve([{ role: 'TEAM_LEADER' }]);
      if (table === 'teamSubgroupMember') return Promise.resolve([{ memberId: 'owner' }]); // project creator is in their group
      if (table === 'projectCollaborator') {
        // second call (the per-user check at the end) must be empty so only the subgroup path grants it
        return Promise.resolve(arg?.where?.userId ? [] : []);
      }
      return Promise.resolve([]);
    });
    const optedIn = { ...teamProject, visibleToSubgroup: true };
    expect(await canViewProject(optedIn, 'leader')).toBe(true);
    // ...but still cannot edit it
    findMany.mockImplementation((table: string) =>
      table === 'teamMembership' ? Promise.resolve([{ role: 'TEAM_LEADER' }]) : Promise.resolve([])
    );
    expect(await canEditProject(optedIn, 'leader')).toBe(false);
  });

  it('visibleToSubgroup does NOT grant access to a leader with nobody on the project', async () => {
    findMany.mockImplementation((table: string) => {
      if (table === 'teamMembership') return Promise.resolve([{ role: 'TEAM_LEADER' }]);
      if (table === 'teamSubgroupMember') return Promise.resolve([{ memberId: 'someone-else' }]);
      return Promise.resolve([]);
    });
    const optedIn = { ...teamProject, visibleToSubgroup: true };
    expect(await canViewProject(optedIn, 'leader')).toBe(false);
  });
});

describe('chat access', () => {
  it('a non-member cannot access team chat', async () => {
    findMany.mockResolvedValue([]);
    expect(await canAccessTeamChat('team1', 'outsider')).toBe(false);
  });
  it('a member can', async () => {
    findMany.mockResolvedValue([{ role: 'MEMBER' }]);
    expect(await canAccessTeamChat('team1', 'member')).toBe(true);
  });
  it('direct chat needs both parties to be members', async () => {
    findMany.mockResolvedValue([{ role: 'MEMBER' }]);
    expect(await canAccessDirectChat('team1', 'a', 'b')).toBe(true);
    expect(await canAccessDirectChat('team1', 'a', 'a')).toBe(false); // can't DM yourself
  });
});
