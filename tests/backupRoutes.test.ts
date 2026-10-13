import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-style tests for the backup export/import route handlers
 * (GET/POST /api/user/backup) - flagged 0% route coverage by the pre-launch
 * audit even though the pure validation logic in src/lib/backup.ts already
 * had good unit coverage (tests/backup.test.ts). These exercise the actual
 * handlers: export shape, and a full export -> wipe -> restore round trip
 * against an in-memory fake db (same pattern as tests/teamRoutes.test.ts),
 * including the createMany-based batched restore path.
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
    if (v === null) return row?.[k] === null || row?.[k] === undefined;
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
    create: async ({ data }: any) => {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row as T);
      return row;
    },
    createMany: async ({ data }: any) => {
      const arr = Array.isArray(data) ? data : [data];
      const created = arr.map((d: any) => ({ id: d.id ?? nextId(), createdAt: new Date(), updatedAt: new Date(), ...d }));
      rows.push(...(created as T[]));
      return { count: created.length };
    },
    deleteMany: async ({ where }: any = {}) => {
      const before = rows.length;
      const kept = rows.filter((r) => !matchWhere(r, where));
      rows.length = 0;
      rows.push(...(kept as T[]));
      return { count: before - kept.length };
    },
  };
}

const settings: any[] = [];
const projects: any[] = [];
const notebooks: any[] = [];
const notebookPages: any[] = [];
const notebookAttachments: any[] = [];
const tasks: any[] = [];
const accomplishmentRecords: any[] = [];
const calendarEvents: any[] = [];
const instruments: any[] = [];
const jobs: any[] = [];
const notifications: any[] = [];
const teamMemberships: any[] = [];

const settingModel = makeModel(settings);
const notebookModel = makeModel(notebooks);
const notebookPageModel = makeModel(notebookPages);

const db = {
  setting: {
    ...settingModel,
    findUnique: async ({ where }: any) => settings.find((s) => s.userId === where.userId) ?? null,
  },
  project: makeModel(projects),
  notebook: {
    ...notebookModel,
    findMany: async ({ where }: any = {}) => notebooks.filter((n) => matchWhere(n, where)).map((n) => ({
      ...n,
      page: notebookPages.find((pg) => pg.notebookId === n.id) || null,
    })),
  },
  notebookPage: {
    ...notebookPageModel,
    findUnique: async ({ where }: any) => {
      if (where.notebookId) return notebookPages.find((pg) => pg.notebookId === where.notebookId) ?? null;
      return notebookPages.find((pg) => pg.id === where.id) ?? null;
    },
  },
  notebookAttachment: makeModel(notebookAttachments),
  task: makeModel(tasks),
  accomplishmentRecord: makeModel(accomplishmentRecords),
  calendarEvent: makeModel(calendarEvents),
  instrument: makeModel(instruments),
  job: makeModel(jobs),
  notification: makeModel(notifications),
  teamMembership: {
    ...makeModel(teamMemberships),
    findMany: async ({ where }: any = {}) => teamMemberships.filter((m) => matchWhere(m, where)),
  },
};
 
(db as any).$transaction = async (fn: (tx: typeof db) => Promise<void>) => fn(db);
vi.mock('@/lib/db', () => ({ db }));

function resetFakeDb() {
  for (const arr of [
    settings, projects, notebooks, notebookPages, notebookAttachments,
    tasks, accomplishmentRecords, calendarEvents, instruments, jobs, notifications, teamMemberships,
  ]) {
    arr.length = 0;
  }
  seq = 0;
}

const req = (body?: unknown, url = 'http://localhost/api/user/backup') =>
  (new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb();
  getSessionUser.mockResolvedValue(null);
});

describe('GET /api/user/backup (export)', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/user/backup/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('exports only the caller\'s own rows, plus a read-only team-membership reference', async () => {
    projects.push({ id: nextId(), userId: 'u1', name: 'Mine' });
    projects.push({ id: nextId(), userId: 'u2', name: 'Not mine' });
    tasks.push({ id: nextId(), userId: 'u1', name: 'Task A' });
    teamMemberships.push({ id: nextId(), userId: 'u1', teamId: 'team1', role: 'OWNER', joinedAt: new Date(), team: { name: 'Lab', ownerId: 'u1' } });

    getSessionUser.mockResolvedValue({ userId: 'u1', name: 'Suhas' });
    const { GET } = await import('@/app/api/user/backup/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('1.0');
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe('Mine');
    expect(body.tasks).toHaveLength(1);
    expect(body.teamMembershipsReference).toHaveLength(1);
    expect(body.teamMembershipsReference[0].team.name).toBe('Lab');
  });
});

describe('POST /api/user/backup (restore)', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/user/backup/route');
    const res = await POST(req({ version: '1.0', projects: [], notebooks: [], tasks: [], accomplishments: [], calendarEvents: [], instruments: [], jobs: [], notifications: [] }));
    expect(res.status).toBe(401);
  });

  it('400 on an unsupported/malformed backup file', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/user/backup/route');
    const res = await POST(req({ not: 'a backup' }));
    expect(res.status).toBe(400);
  });

  it('a full export -> restore round trip preserves counts and doesn\'t touch another user\'s data', async () => {
    projects.push({ id: 'proj-keep-id', userId: 'u1', name: 'Rigidity project' });
    tasks.push({ id: 'task-1', userId: 'u1', name: 'Run simulation', date: new Date().toISOString() });
    tasks.push({ id: 'task-2', userId: 'u1', name: 'Draft methods', date: new Date().toISOString() });
    notebooks.push({ id: 'nb-1', userId: 'u1', title: 'Lab notebook', projectId: null });
    notebookPages.push({ id: 'pg-1', notebookId: 'nb-1', title: 'Notebook', content: 'some notes' });
    // A second user's data must survive the first user's restore untouched.
    tasks.push({ id: 'task-other', userId: 'u2', name: 'Not mine' });

    getSessionUser.mockResolvedValue({ userId: 'u1', name: 'Suhas' });
    const { GET, POST } = await import('@/app/api/user/backup/route');

    const exported = await (await GET()).json();
    expect(exported.tasks).toHaveLength(2);

    const restoreRes = await POST(req(exported));
    expect(restoreRes.status).toBe(200);

    // Restored rows exist for u1, with counts matching what was exported.
    expect(tasks.filter((t) => t.userId === 'u1')).toHaveLength(2);
    expect(projects.filter((pr) => pr.userId === 'u1')).toHaveLength(1);
    const restoredNotebook = notebooks.find((n) => n.userId === 'u1');
    expect(restoredNotebook).toBeTruthy();
    const restoredPage = notebookPages.find((pg) => pg.notebookId === restoredNotebook.id);
    expect(restoredPage?.content).toBe('some notes');

    // u2's task was never touched.
    expect(tasks.find((t) => t.id === 'task-other')).toBeTruthy();
  });

  it('a run linked to a notebook is restored pointing at the restored page (used to fail every restore)', async () => {
    tasks.push({ id: 'task-1', userId: 'u1', name: 'Run simulation', date: new Date().toISOString() });
    notebooks.push({ id: 'nb-1', userId: 'u1', title: 'Lab notebook', projectId: null });
    notebookPages.push({ id: 'pg-1', notebookId: 'nb-1', title: 'Notebook', content: 'notes' });
    jobs.push({ id: 'job-1', userId: 'u1', name: 'DFT run', taskId: 'task-1', notebookPageId: 'pg-1', attempts: [] });

    getSessionUser.mockResolvedValue({ userId: 'u1', name: 'Suhas' });
    const { GET, POST } = await import('@/app/api/user/backup/route');
    const exported = await (await GET()).json();
    const created: string[] = [];
    const origPage = db.notebookPage.create;
    const origJob = db.job.createMany;
    db.notebookPage.create = async (a: any) => { created.push('page'); return origPage(a); };
    db.job.createMany = async (a: any) => { created.push('jobs'); return origJob(a); };
    try {
      const res = await POST(req(exported));
      expect(res.status).toBe(200);
    } finally {
      db.notebookPage.create = origPage;
      db.job.createMany = origJob;
    }
    expect(created).toEqual(['page', 'jobs']);
    // (The fake db doesn't cascade-delete the old page; look up the new one.)
    const restoredNotebook = notebooks.find((n) => n.userId === 'u1' && n.id !== 'nb-1');
    const page = notebookPages.find((pg) => pg.notebookId === restoredNotebook.id);
    const job = jobs.find((j) => j.name === 'DFT run');
    expect(page.id).not.toBe('pg-1');
    expect(job.notebookPageId).toBe(page.id);
    expect(job.taskId).toBe('task-1');
  });
});
