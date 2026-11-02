import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Who can reach backups: an account's are its owner's alone; a project's
 * belong to whoever can edit the project; the daily job needs CRON_SECRET.
 * The backup builder itself is mocked here - its output is covered by
 * tests/backupFormat.test.ts and the e2e suite.
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getSessionUser: (...a: unknown[]) => getSessionUser(...a) }));

const canEditProject = vi.fn();
vi.mock('@/lib/teams', () => ({ canEditProject: (...a: unknown[]) => canEditProject(...a) }));

const createBackup = vi.fn();
const runAllDueBackups = vi.fn();
vi.mock('@/lib/backups', () => ({
  BACKUP_META_SELECT: {},
  BackupTooLargeError: class extends Error {},
  createBackup: (...a: unknown[]) => createBackup(...a),
  runAllDueBackups: (...a: unknown[]) => runAllDueBackups(...a),
  runDueBackups: vi.fn(async () => []),
  getBackupPolicy: vi.fn(async () => ({ frequency: 'OFF' })),
}));

const backups: Array<Record<string, unknown>> = [];
const projects: Array<Record<string, unknown>> = [];
const settings: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db', () => ({
  db: {
    backup: {
      findUnique: async ({ where }: { where: { id: string } }) => backups.find((b) => b.id === where.id) ?? null,
      findMany: async () => backups,
      delete: async ({ where }: { where: { id: string } }) => backups.splice(backups.findIndex((b) => b.id === where.id), 1)[0],
    },
    project: {
      findUnique: async ({ where }: { where: { id: string } }) => projects.find((p) => p.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(projects.find((p) => p.id === where.id)!, data),
    },
    setting: { upsert: async ({ create }: { create: Record<string, unknown> }) => { settings.push(create); return create; } },
  },
}));

const req = (url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) =>
  new NextRequest(new URL(url, 'http://localhost'), {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getSessionUser.mockReset();
  canEditProject.mockReset();
  createBackup.mockReset();
  runAllDueBackups.mockReset();
  backups.length = 0;
  projects.length = 0;
  settings.length = 0;
  backups.push(
    { id: 'mine', userId: 'u1', projectId: null, fileName: 'rune-backup-2026-11-02-1530.zip', data: Buffer.from('PK'), createdAt: new Date() },
    { id: 'theirs', userId: 'u2', projectId: null, fileName: 'rune-backup-2026-11-02-1531.zip', data: Buffer.from('PK'), createdAt: new Date() },
    { id: 'proj', userId: 'u2', projectId: 'p1', fileName: 'rune-project-x-2026-11-02-1532.zip', data: Buffer.from('PK'), createdAt: new Date() },
  );
  projects.push({ id: 'p1', userId: 'u2', backupFrequency: 'OFF', lastBackupAt: null });
});

describe('signed out', () => {
  it('every backup route answers 401', async () => {
    getSessionUser.mockResolvedValue(null);
    const list = await import('@/app/api/backups/route');
    const one = await import('@/app/api/backups/[id]/route');
    const policy = await import('@/app/api/backups/policy/route');
    const due = await import('@/app/api/backups/run-due/route');
    expect((await list.GET(req('/api/backups'))).status).toBe(401);
    expect((await list.POST(req('/api/backups', { method: 'POST', body: {} }))).status).toBe(401);
    expect((await one.GET(req('/api/backups/mine'), params('mine'))).status).toBe(401);
    expect((await one.DELETE(req('/api/backups/mine', { method: 'DELETE' }), params('mine'))).status).toBe(401);
    expect((await policy.GET(req('/api/backups/policy'))).status).toBe(401);
    expect((await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: {} }))).status).toBe(401);
    expect((await due.POST(req('/api/backups/run-due', { method: 'POST' }))).status).toBe(401);
  });
});

describe('downloading and deleting', () => {
  beforeEach(() => getSessionUser.mockResolvedValue({ userId: 'u1', name: 'Me' }));

  it('your own account backup downloads as a .zip', async () => {
    const one = await import('@/app/api/backups/[id]/route');
    const res = await one.GET(req('/api/backups/mine'), params('mine'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="rune-backup-2026-11-02-1530.zip"');
  });

  it('someone else\'s account backup is not found, even to delete', async () => {
    const one = await import('@/app/api/backups/[id]/route');
    expect((await one.GET(req('/api/backups/theirs'), params('theirs'))).status).toBe(404);
    expect((await one.DELETE(req('/api/backups/theirs', { method: 'DELETE' }), params('theirs'))).status).toBe(404);
    expect(backups.some((b) => b.id === 'theirs')).toBe(true);
  });

  it('a project backup is reachable only by someone who can edit the project', async () => {
    const one = await import('@/app/api/backups/[id]/route');
    canEditProject.mockResolvedValue(false);
    expect((await one.GET(req('/api/backups/proj'), params('proj'))).status).toBe(404);
    canEditProject.mockResolvedValue(true);
    expect((await one.GET(req('/api/backups/proj'), params('proj'))).status).toBe(200);
  });
});

describe('making backups and schedules', () => {
  beforeEach(() => getSessionUser.mockResolvedValue({ userId: 'u1', name: 'Me' }));

  it('cannot back up, list or schedule a project you can\'t edit', async () => {
    canEditProject.mockResolvedValue(false);
    const list = await import('@/app/api/backups/route');
    const policy = await import('@/app/api/backups/policy/route');
    expect((await list.POST(req('/api/backups', { method: 'POST', body: { projectId: 'p1' } }))).status).toBe(403);
    expect((await list.GET(req('/api/backups?projectId=p1'))).status).toBe(403);
    expect((await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: { projectId: 'p1', frequency: 'DAILY' } }))).status).toBe(403);
    expect(createBackup).not.toHaveBeenCalled();
    expect(projects[0].backupFrequency).toBe('OFF');
  });

  it('an editor can schedule the project', async () => {
    canEditProject.mockResolvedValue(true);
    const policy = await import('@/app/api/backups/policy/route');
    const res = await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: { projectId: 'p1', frequency: 'WEEKLY' } }));
    expect(res.status).toBe(200);
    expect(projects[0].backupFrequency).toBe('WEEKLY');
  });

  it('rejects out-of-range or unknown policy fields', async () => {
    const policy = await import('@/app/api/backups/policy/route');
    expect((await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: { keep: 500 } }))).status).toBe(400);
    expect((await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: { frequency: 'HOURLY' } }))).status).toBe(400);
    expect((await policy.PUT(req('/api/backups/policy', { method: 'PUT', body: { userId: 'u2' } }))).status).toBe(400);
    expect(settings).toHaveLength(0);
  });

  it('a manual account backup is made for the caller', async () => {
    createBackup.mockResolvedValue({ id: 'new' });
    const list = await import('@/app/api/backups/route');
    const res = await list.POST(req('/api/backups', { method: 'POST', body: {} }));
    expect(res.status).toBe(201);
    expect(createBackup).toHaveBeenCalledWith({ userId: 'u1', projectId: null, trigger: 'MANUAL' });
  });
});

describe('the daily job', () => {
  it('needs CRON_SECRET, and the right one', async () => {
    const cron = await import('@/app/api/cron/backups/route');
    delete process.env.CRON_SECRET;
    expect((await cron.GET(req('/api/cron/backups'))).status).toBe(503);
    process.env.CRON_SECRET = 'a-long-random-secret';
    expect((await cron.GET(req('/api/cron/backups'))).status).toBe(401);
    expect((await cron.GET(req('/api/cron/backups', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    expect(runAllDueBackups).not.toHaveBeenCalled();
    runAllDueBackups.mockResolvedValue({ users: 1, backups: 2 });
    const ok = await cron.GET(req('/api/cron/backups', { headers: { authorization: 'Bearer a-long-random-secret' } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ users: 1, backups: 2 });
    delete process.env.CRON_SECRET;
  });
});
