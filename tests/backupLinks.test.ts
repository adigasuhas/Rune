import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * sanitizeBackupLinks: a restored backup may only link records to the
 * restorer's own data, or to what the live API would let them link.
 */
const projects: Record<string, { id: string; userId: string; teamId?: string | null }> = {};
const instruments: Record<string, { id: string; userId: string; teamId: string | null }> = {};
const memberships: Record<string, string> = {}; // teamId -> role, for the restorer 'me'
const teammates = new Set<string>(); // users sharing a team with 'me'

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async ({ where }: any) => projects[where.id] ?? null },
    instrument: { findUnique: async ({ where }: any) => instruments[where.id] ?? null },
  },
}));
vi.mock('@/lib/teams', () => ({
  getMembership: async (teamId: string, userId: string) => (userId === 'me' && memberships[teamId] ? { role: memberships[teamId] } : null),
  canViewProject: async (p: { id: string }) => p.id === 'shared-team-project',
  usersShareATeam: async (_a: string, b: string) => teammates.has(b),
}));

const empty = { settings: null, projects: [], notebooks: [], tasks: [], accomplishments: [], calendarEvents: [], instruments: [], jobs: [], notifications: [] };

beforeEach(() => {
  for (const o of [projects, instruments, memberships]) for (const k of Object.keys(o)) delete (o as any)[k];
  teammates.clear();
  projects['victim-project'] = { id: 'victim-project', userId: 'victim' };
  projects['shared-team-project'] = { id: 'shared-team-project', userId: 'leader', teamId: 'my-team' };
  instruments['victim-inst'] = { id: 'victim-inst', userId: 'victim', teamId: null };
  instruments['team-inst'] = { id: 'team-inst', userId: 'leader', teamId: 'my-team' };
  memberships['my-team'] = 'MEMBER';
  teammates.add('teammate');
});

describe('sanitizeBackupLinks', () => {
  it('keeps links between records in the same backup', async () => {
    const { sanitizeBackupLinks } = await import('@/lib/backupLinks');
    const out = await sanitizeBackupLinks({
      ...empty,
      projects: [{ id: 'p1' }],
      tasks: [{ id: 't1', projectId: 'p1' }],
      calendarEvents: [{ id: 'e1', taskId: 't1' }],
      instruments: [{ id: 'i1' }],
      notebooks: [{ id: 'n1', projectId: 'p1', page: { id: 'pg1', authorId: 'me' } }],
      jobs: [{ id: 'j1', taskId: 't1', instrumentId: 'i1', notebookPageId: 'pg1' }],
    }, 'me');
    expect(out.tasks[0].projectId).toBe('p1');
    expect(out.calendarEvents[0].taskId).toBe('t1');
    expect(out.notebooks[0]).toMatchObject({ projectId: 'p1', page: { authorId: 'me' } });
    expect(out.jobs[0]).toMatchObject({ taskId: 't1', instrumentId: 'i1', notebookPageId: 'pg1' });
  });

  it('drops links to another user\'s private records', async () => {
    const { sanitizeBackupLinks } = await import('@/lib/backupLinks');
    const out = await sanitizeBackupLinks({
      ...empty,
      tasks: [{ id: 't1', projectId: 'victim-project', assignedById: 'stranger', blockedOnUserId: 'stranger' }],
      calendarEvents: [{ id: 'e1', taskId: 'victims-task' }],
      notebooks: [{ id: 'n1', projectId: 'victim-project', page: { id: 'pg1', authorId: 'stranger' } }],
      jobs: [{ id: 'j1', taskId: 'victims-task', instrumentId: 'victim-inst', notebookPageId: 'victims-page' }],
    }, 'me');
    expect(out.tasks[0]).toMatchObject({ projectId: null, assignedById: null, blockedOnUserId: null });
    expect(out.calendarEvents[0].taskId).toBeNull();
    expect(out.notebooks[0]).toMatchObject({ projectId: null, page: { authorId: null } });
    expect(out.jobs[0]).toMatchObject({ taskId: null, instrumentId: null, notebookPageId: null });
  });

  it('keeps links the live API would allow: a viewable team project, a team instrument, a teammate', async () => {
    const { sanitizeBackupLinks } = await import('@/lib/backupLinks');
    const out = await sanitizeBackupLinks({
      ...empty,
      tasks: [{ id: 't1', projectId: 'shared-team-project', assignedById: 'teammate' }],
      jobs: [{ id: 'j1', instrumentId: 'team-inst' }],
    }, 'me');
    expect(out.tasks[0]).toMatchObject({ projectId: 'shared-team-project', assignedById: 'teammate' });
    expect(out.jobs[0].instrumentId).toBe('team-inst');
  });

  it('a project or instrument keeps its team only if the restorer is in that team', async () => {
    const { sanitizeBackupLinks } = await import('@/lib/backupLinks');
    const out = await sanitizeBackupLinks({
      ...empty,
      projects: [{ id: 'p1', teamId: 'my-team' }, { id: 'p2', teamId: 'someone-elses-team' }],
      instruments: [{ id: 'i1', teamId: 'my-team' }, { id: 'i2', teamId: 'someone-elses-team' }],
    }, 'me');
    expect(out.projects.map((p) => p.teamId)).toEqual(['my-team', null]);
    expect(out.instruments.map((i) => i.teamId)).toEqual(['my-team', null]);
  });
});
