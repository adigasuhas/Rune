import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: (...a: unknown[]) => findUnique('project', ...a) },
    team: { findUnique: (...a: unknown[]) => findUnique('team', ...a) },
    teamMembership: { findMany: (...a: unknown[]) => findMany('teamMembership', ...a) },
    projectCollaborator: { findMany: (...a: unknown[]) => findMany('projectCollaborator', ...a) },
    teamSubgroupMember: { findMany: (...a: unknown[]) => findMany('teamSubgroupMember', ...a) },
  },
}));

import { canViewNotebook, canReviewNotebook } from '@/lib/notebookAccess';

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
  findMany.mockResolvedValue([]);
});

describe('canViewNotebook', () => {
  it('the owner always can', async () => {
    expect(await canViewNotebook({ id: 'n', userId: 'me', projectId: null }, 'me')).toBe(true);
  });

  it('a stranger cannot view a personal notebook', async () => {
    expect(await canViewNotebook({ id: 'n', userId: 'someone', projectId: null }, 'me')).toBe(false);
  });

  it('a project-linked notebook is viewable by anyone who can view the project', async () => {
    findUnique.mockImplementation((table: string) =>
      table === 'project' ? Promise.resolve({ id: 'p', userId: 'someone', teamId: 't' }) : Promise.resolve(null)
    );
    findMany.mockImplementation((table: string) =>
      table === 'teamMembership' ? Promise.resolve([{ role: 'OWNER' }]) : Promise.resolve([])
    );
    expect(await canViewNotebook({ id: 'n', userId: 'someone', projectId: 'p' }, 'me')).toBe(true);
  });
});

describe('canReviewNotebook', () => {
  it('the owner is never a reviewer of their own notebook', async () => {
    findUnique.mockResolvedValue({ id: 'p', userId: 'me', teamId: 't' });
    expect(await canReviewNotebook({ id: 'n', userId: 'me', projectId: 'p' }, 'me')).toBe(false);
  });

  it('a personal notebook has no reviewers', async () => {
    expect(await canReviewNotebook({ id: 'n', userId: 'someone', projectId: null }, 'me')).toBe(false);
  });

  it('a team owner reviewing a member notebook can', async () => {
    findUnique.mockImplementation((table: string) =>
      table === 'project' ? Promise.resolve({ id: 'p', userId: 'member', teamId: 't' }) : Promise.resolve(null)
    );
    findMany.mockImplementation((table: string) =>
      table === 'teamMembership' ? Promise.resolve([{ role: 'OWNER' }]) : Promise.resolve([])
    );
    expect(await canReviewNotebook({ id: 'n', userId: 'member', projectId: 'p' }, 'owner')).toBe(true);
  });
});
