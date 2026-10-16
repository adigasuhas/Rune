import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * HTTP-level route-handler tests. `@/lib/auth` (session) and `@/lib/db` are
 * mocked so we exercise the real handler code — auth gate, input validation,
 * status codes — without a running server or a database.
 *
 * Complements tests/rbac.test.ts + tests/backup.test.ts (which test the pure
 * decision functions) and tests/security.test.ts (rate limiter, sanitizer).
 */

const getSessionUser = vi.fn();
const setSessionCookie = vi.fn();
const invalidateSessionCache = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
  setSessionCookie: (...a: unknown[]) => setSessionCookie(...a),
  invalidateSessionCache: (...a: unknown[]) => invalidateSessionCache(...a),
  clearSessionCookie: vi.fn(),
}));

const db = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
  task: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  project: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  notebook: { findUnique: vi.fn(), findMany: vi.fn() },
  notebookPage: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  notebookComment: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
  calendarEvent: { count: vi.fn() },
  teamMembership: { findMany: vi.fn() },
  team: { findUnique: vi.fn(), findMany: vi.fn() },
  teamSubgroupMember: { findMany: vi.fn() },
  projectCollaborator: { findMany: vi.fn() },
  instrument: { findMany: vi.fn(), create: vi.fn() },
  job: { findMany: vi.fn() },
  notification: { findMany: vi.fn(), create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  chatMessage: { findMany: vi.fn(), create: vi.fn() },
  setting: { findUnique: vi.fn() },
};
vi.mock('@/lib/db', () => ({ db }));

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue(null);
  delete process.env.RUNE_ADMIN_EMAILS;
  vi.stubEnv('NODE_ENV', 'test');
});

// Cast to `never` (matching this file's other ad-hoc request-shaped mocks,
// e.g. `nreq`) rather than importing the real NextRequest type - route
// handlers only ever touch the plain Request surface (`.url`, `.json()`,
// `.headers`) plus whatever `enforceRateLimit` needs (`.headers.get`), all
// of which a real `Request` already provides.
const req = (body?: unknown, url = 'http://localhost/api/x') =>
  (new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never);

describe('auth gate', () => {
  it('GET /api/tasks → 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/tasks/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('GET /api/tasks → 200 and scopes to the session user', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findMany.mockResolvedValue([{ id: 't1' }]);
    const { GET } = await import('@/app/api/tasks/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.task.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('GET /api/auth/me → 200 { authenticated: false } for a visitor with no credentials (UX-01)', async () => {
    const { GET } = await import('@/app/api/auth/me/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false, user: null });
  });

  it('GET /api/auth/me → 401 when a credential was sent but is invalid', async () => {
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => undefined }),
      headers: async () => new Headers({ authorization: 'Bearer rune_pat_revoked' }),
    }));
    vi.resetModules();
    const { GET } = await import('@/app/api/auth/me/route');
    const res = await GET();
    expect(res.status).toBe(401);
    vi.doUnmock('next/headers');
    vi.resetModules();
  });
});

describe('admin gate — /api/developer/users', () => {
  const nreq = (url = 'http://localhost/api/developer/users') =>
    ({ nextUrl: new URL(url) }) as never;

  it('401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/developer/users/route');
    const res = await GET(nreq());
    expect(res.status).toBe(401);
  });

  it('403 for a signed-in non-admin', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'nobody@example.com', role: 'USER', status: 'ACTIVE', deletedAt: null });
    const { GET } = await import('@/app/api/developer/users/route');
    const res = await GET(nreq());
    expect(res.status).toBe(403);
  });

  it('403 for a suspended admin', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'boss@lab.edu', role: 'DEVELOPER', status: 'SUSPENDED', deletedAt: null });
    const { GET } = await import('@/app/api/developer/users/route');
    const res = await GET(nreq());
    expect(res.status).toBe(403);
  });

  it('allows a DEVELOPER-role account through the gate', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'boss@lab.edu', role: 'DEVELOPER', status: 'ACTIVE', deletedAt: null });
    db.user.count.mockResolvedValue(0);
    db.project.count.mockResolvedValue(0);
    db.task.count.mockResolvedValue(0);
    db.user.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/developer/users/route');
    const res = await GET(nreq());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ users: [], stats: { totalUsers: 0 } });
  });

  it('email-allowlist admin also passes (RUNE_ADMIN_EMAILS)', async () => {
    vi.stubEnv('RUNE_ADMIN_EMAILS', 'chief@lab.edu');
    getSessionUser.mockResolvedValue({ userId: 'u2' });
    db.user.findUnique.mockResolvedValue({ id: 'u2', email: 'chief@lab.edu', role: 'USER', status: 'ACTIVE', deletedAt: null });
    db.user.count.mockResolvedValue(0);
    db.project.count.mockResolvedValue(0);
    db.task.count.mockResolvedValue(0);
    db.user.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/developer/users/route');
    const res = await GET(nreq());
    expect(res.status).toBe(200);
  });
});

describe('input validation', () => {
  it('PUT /api/notebooks/[id]/pages/[pageId] → 401 unauthenticated', async () => {
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/route');
    const res = await PUT(req({ title: 'x' }), { params: Promise.resolve({ id: 'nb1', pageId: 'p1' }) });
    expect(res.status).toBe(401);
  });

  it('PUT /api/notebooks/[id]/pages/[pageId] → 404 when the notebook is not the caller\'s', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notebook.findUnique.mockResolvedValue({ id: 'nb1', userId: 'someone-else' });
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/route');
    const res = await PUT(req({ title: 'x' }), { params: Promise.resolve({ id: 'nb1', pageId: 'p1' }) });
    expect(res.status).toBe(404);
  });

  it('PUT /api/notebooks/[id]/pages/[pageId] → 404 when the page belongs to a different notebook', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notebook.findUnique.mockResolvedValue({ id: 'nb1', userId: 'u1' });
    db.notebookPage.findUnique.mockResolvedValue({ id: 'p1', notebookId: 'other-nb' });
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/route');
    const res = await PUT(req({ content: 'x' }), { params: Promise.resolve({ id: 'nb1', pageId: 'p1' }) });
    expect(res.status).toBe(404);
  });
});

describe('Phase 2/3 surfaces — auth gate + scoping', () => {
  const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

  it('GET /api/tasks/blocking-me → 401 then 200 scoped to the caller', async () => {
    const mod = await import('@/app/api/tasks/blocking-me/route');
    expect((await mod.GET()).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findMany.mockResolvedValue([]);
    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect(db.task.findMany).toHaveBeenCalledWith({ where: { blockedOnUserId: 'u1', status: 'BLOCKED' } });
  });

  it('GET /api/teammates → 401 then [] when the caller is on no teams', async () => {
    const mod = await import('@/app/api/teammates/route');
    expect((await mod.GET()).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.teamMembership.findMany.mockResolvedValue([]);
    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/lab/overview → 401 then empty payload for a teamless caller', async () => {
    const mod = await import('@/app/api/lab/overview/route');
    expect((await mod.GET()).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.teamMembership.findMany.mockResolvedValue([]);
    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ teams: [], projects: [] });
  });

  it('GET /api/lab/standup → 401 then {teams:[]} when the caller leads nothing', async () => {
    const mod = await import('@/app/api/lab/standup/route');
    expect((await mod.GET()).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.teamMembership.findMany.mockResolvedValue([{ teamId: 't1', role: 'MEMBER' }]);
    const res = await mod.GET();
    expect(await res.json()).toEqual({ teams: [] });
  });

  it('GET /api/review-queue → 401 then [] with no ready pages', async () => {
    const mod = await import('@/app/api/review-queue/route');
    expect((await mod.GET()).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notebook.findMany.mockResolvedValue([]);
    expect(await (await mod.GET()).json()).toEqual([]);
  });

  it('GET /api/digest/weekly → 401 unauthenticated', async () => {
    const mod = await import('@/app/api/digest/weekly/route');
    expect((await mod.GET()).status).toBe(401);
  });

  it('GET /api/instruments → returns own + team-shared, marking canEdit', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.teamMembership.findMany.mockResolvedValue([{ teamId: 't1' }]);
    db.instrument.findMany
      .mockResolvedValueOnce([{ id: 'i1', name: 'mine', teamId: null }])   // own
      .mockResolvedValueOnce([{ id: 'i2', name: 'shared', teamId: 't1' }]); // team-shared
    db.team.findMany.mockResolvedValue([{ id: 't1', name: 'Lab' }]);
    const { GET } = await import('@/app/api/instruments/route');
    const rows = await (await GET()).json();
    expect(rows.find((r: any) => r.id === 'i1').canEdit).toBe(true);
    expect(rows.find((r: any) => r.id === 'i2')).toMatchObject({ canEdit: false, sharedFrom: 'Lab' });
  });

  it('PUT notebook page review → 403 when a non-owner asks for READY', async () => {
    getSessionUser.mockResolvedValue({ userId: 'reviewer' });
    db.notebook.findUnique.mockResolvedValue({ id: 'nb1', userId: 'owner', projectId: 'p1' });
    db.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', teamId: 't1' });
    db.teamMembership.findMany.mockResolvedValue([{ role: 'OWNER' }]);
    db.projectCollaborator.findMany.mockResolvedValue([]);
    db.notebookPage.findUnique.mockResolvedValue({ id: 'pg1', notebookId: 'nb1', reviewStatus: 'NONE' });
    const { PUT } = await import('@/app/api/notebooks/[id]/pages/[pageId]/review/route');
    const res = await PUT(req({ status: 'READY' }), p({ id: 'nb1', pageId: 'pg1' }));
    expect(res.status).toBe(403);
  });

  it('POST notebook comment → 404 when the caller cannot see the notebook', async () => {
    getSessionUser.mockResolvedValue({ userId: 'stranger' });
    db.notebook.findUnique.mockResolvedValue({ id: 'nb1', userId: 'owner', projectId: null });
    const { POST } = await import('@/app/api/notebooks/[id]/pages/[pageId]/comments/route');
    const res = await POST(req({ body: 'hi' }), p({ id: 'nb1', pageId: 'pg1' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/tasks/[id]/respond', () => {
  const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;

  it('401 unauthenticated', async () => {
    const { POST } = await import('@/app/api/tasks/[id]/respond/route');
    const res = await POST(req({ action: 'accept' }), p({ id: 't1' }));
    expect(res.status).toBe(401);
  });

  it('404 when the task is not the caller\'s', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findUnique.mockResolvedValue({ id: 't1', userId: 'someone-else' });
    const { POST } = await import('@/app/api/tasks/[id]/respond/route');
    const res = await POST(req({ action: 'accept' }), p({ id: 't1' }));
    expect(res.status).toBe(404);
  });

  it('400 when the task is not awaiting acceptance', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', assignmentStatus: 'ACCEPTED' });
    const { POST } = await import('@/app/api/tasks/[id]/respond/route');
    const res = await POST(req({ action: 'accept' }), p({ id: 't1' }));
    expect(res.status).toBe(400);
  });

  it('accepts a pending assignment and notifies the assigner', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', assignmentStatus: 'PENDING_ACCEPTANCE', assignedById: 'boss1', name: 'Do the thing' });
    db.task.update.mockResolvedValue({ id: 't1', name: 'Do the thing', assignmentStatus: 'ACCEPTED', declineReason: null });
    db.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Assignee', email: 'a@x.com' });
    const { POST } = await import('@/app/api/tasks/[id]/respond/route');
    const res = await POST(req({ action: 'accept' }), p({ id: 't1' }));
    expect(res.status).toBe(200);
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { assignmentStatus: 'ACCEPTED', declineReason: null } });
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'boss1', type: 'TASK_ACCEPTED' }) }));
  });

  it('declines with a reason and notifies the assigner', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', assignmentStatus: 'PENDING_ACCEPTANCE', assignedById: 'boss1', name: 'Do the thing' });
    db.task.update.mockResolvedValue({ id: 't1', name: 'Do the thing', assignmentStatus: 'DECLINED', declineReason: 'too busy' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Assignee', email: 'a@x.com' });
    const { POST } = await import('@/app/api/tasks/[id]/respond/route');
    const res = await POST(req({ action: 'decline', reason: 'too busy' }), p({ id: 't1' }));
    expect(res.status).toBe(200);
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { assignmentStatus: 'DECLINED', declineReason: 'too busy' } });
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'boss1', type: 'TASK_DECLINED' }) }));
  });
});

describe('POST /api/user/set-password', () => {
  it('401 unauthenticated', async () => {
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ newPassword: 'LongEnough12345' }));
    expect(res.status).toBe(401);
  });

  it('400 when the new password is too short', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ newPassword: 'short' }));
    expect(res.status).toBe(400);
  });

  it('403 when changing an existing password with the wrong current one', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hashPassword('CorrectOld12345') });
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ currentPassword: 'WrongOld12345', newPassword: 'NewPassword12345' }));
    expect(res.status).toBe(403);
  });

  it('sets a first-time password with no current-password check required', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    db.user.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ newPassword: 'NewPassword12345' }));
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });

  it('changes an existing password when the current one is correct', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hashPassword('CorrectOld12345') });
    db.user.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ currentPassword: 'CorrectOld12345', newPassword: 'BrandNewPass12345' }));
    expect(res.status).toBe(200);
  });

  it('signs out every other session but keeps this browser signed in (SEC-03)', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1', email: 'u1@example.com' });
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@example.com', name: 'U', sessionVersion: 4, passwordHash: hashPassword('CorrectOld12345') });
    db.user.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/user/set-password/route');
    const res = await POST(req({ currentPassword: 'CorrectOld12345', newPassword: 'BrandNewPass12345' }));
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sessionVersion: 5 }) }));
    expect(invalidateSessionCache).toHaveBeenCalledWith('u1');
    expect(setSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', sv: 5 }));
  });

  it('does not touch sessions when the current password is wrong', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', sessionVersion: 4, passwordHash: hashPassword('CorrectOld12345') });
    const { POST } = await import('@/app/api/user/set-password/route');
    await POST(req({ currentPassword: 'WrongOld12345', newPassword: 'BrandNewPass12345' }));
    expect(db.user.update).not.toHaveBeenCalled();
    expect(invalidateSessionCache).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/user/account — needs re-authentication (SEC-04)', () => {
  const del = (body?: unknown) => new Request('http://localhost/api/user/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  beforeEach(async () => {
    const { hashPassword } = await import('@/lib/crypto');
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@example.com', passwordHash: hashPassword('CorrectPass12345') });
    db.team.findMany.mockResolvedValue([]);
    db.user.delete.mockResolvedValue({});
  });

  it('403 and nothing deleted without the password (a session alone isn\'t enough)', async () => {
    const { DELETE } = await import('@/app/api/user/account/route');
    expect((await DELETE(del())).status).toBe(403);
    expect((await DELETE(del({ password: 'wrong-password' }))).status).toBe(403);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('deletes with the right password and drops the cached session immediately', async () => {
    const { DELETE } = await import('@/app/api/user/account/route');
    const res = await DELETE(del({ password: 'CorrectPass12345' }));
    expect(res.status).toBe(200);
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(invalidateSessionCache).toHaveBeenCalledWith('u1');
  });

  it('an account without a password confirms with its email instead', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@example.com', passwordHash: null });
    const { DELETE } = await import('@/app/api/user/account/route');
    expect((await DELETE(del({ confirmEmail: 'someone@else.com' }))).status).toBe(403);
    expect((await DELETE(del({ confirmEmail: ' U1@Example.com ' }))).status).toBe(200);
  });
});

describe('POST /api/auth/password-login', () => {
  let ipCounter = 0;
  const pwReq = (body: unknown) => new Request('http://localhost/api/auth/password-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  }) as never;

  it('400 when email or password is missing', async () => {
    const { POST } = await import('@/app/api/auth/password-login/route');
    const res = await POST(pwReq({ email: '', password: '' }));
    expect(res.status).toBe(400);
  });

  it('401 when the account has no password set', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', passwordHash: null });
    const { POST } = await import('@/app/api/auth/password-login/route');
    const res = await POST(pwReq({ email: 'a@x.com', password: 'whatever12345' }));
    expect(res.status).toBe(401);
  });

  it('production refuses the built-in account\'s public default password; dev accepts it', async () => {
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'dev', email: 'developer_adiga@rune.io', passwordHash: hashPassword('developer12345'), status: 'ACTIVE', sessionVersion: 0 });
    db.user.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/auth/password-login/route');
    vi.stubEnv('NODE_ENV', 'production');
    const blocked = await POST(pwReq({ email: 'developer_adiga@rune.io', password: 'developer12345' }));
    expect(blocked.status).toBe(403);
    vi.stubEnv('NODE_ENV', 'test');
    const allowed = await POST(pwReq({ email: 'developer_adiga@rune.io', password: 'developer12345' }));
    expect(allowed.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it('401 on the wrong password', async () => {
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', passwordHash: hashPassword('RightPass12345'), status: 'ACTIVE' });
    const { POST } = await import('@/app/api/auth/password-login/route');
    const res = await POST(pwReq({ email: 'a@x.com', password: 'WrongPass12345' }));
    expect(res.status).toBe(401);
  });

  it('403 for a suspended account even with the right password', async () => {
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', passwordHash: hashPassword('RightPass12345'), status: 'SUSPENDED' });
    const { POST } = await import('@/app/api/auth/password-login/route');
    const res = await POST(pwReq({ email: 'a@x.com', password: 'RightPass12345' }));
    expect(res.status).toBe(403);
  });

  it('200 and signs in on the right password for an active account', async () => {
    const { hashPassword } = await import('@/lib/crypto');
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', name: 'A', avatarUrl: null, passwordHash: hashPassword('RightPass12345'), status: 'ACTIVE', sessionVersion: 0 });
    db.user.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/auth/password-login/route');
    const res = await POST(pwReq({ email: 'a@x.com', password: 'RightPass12345' }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/notifications — bell vs full inbox', () => {
  const notifGetReq = (url: string) => ({ nextUrl: new URL(url) }) as never;

  it('default (no params) returns only active (non-dismissed) notifications', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notification.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/notifications/route');
    await GET(notifGetReq('http://localhost/api/notifications'));
    expect(db.notification.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', dismissedAt: null } });
  });

  it('?all=true includes dismissed history, paginated newest-first', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notification.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/notifications/route');
    await GET(notifGetReq('http://localhost/api/notifications?all=true&skip=50'));
    expect(db.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 50
    });
  });
});

describe('PATCH /api/notifications — mark all read', () => {
  it('401 unauthenticated', async () => {
    const { PATCH } = await import('@/app/api/notifications/route');
    const res = await PATCH(req());
    expect(res.status).toBe(401);
  });

  it('marks every active notification read + dismissed for the caller only', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.notification.updateMany.mockResolvedValue({ count: 3 });
    const { PATCH } = await import('@/app/api/notifications/route');
    const res = await PATCH(req());
    expect(res.status).toBe(200);
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', dismissedAt: null },
      data: { read: true, dismissedAt: expect.any(Date) }
    });
  });
});

describe('GET /api/search', () => {
  const searchReq = (q: string) => ({ nextUrl: new URL(`http://localhost/api/search?q=${encodeURIComponent(q)}`) }) as never;

  it('401 unauthenticated', async () => {
    const { GET } = await import('@/app/api/search/route');
    const res = await GET(searchReq('foo'));
    expect(res.status).toBe(401);
  });

  it('short-circuits to empty results under the 2-character minimum', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    const { GET } = await import('@/app/api/search/route');
    const res = await GET(searchReq('a'));
    expect(await res.json()).toEqual({ tasks: [], projects: [], notebookPages: [], runs: [] });
  });

  it('scopes every search to the caller\'s own records', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.task.findMany.mockResolvedValue([]);
    db.project.findMany.mockResolvedValue([]);
    db.notebookPage.findMany.mockResolvedValue([]);
    db.job.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/search/route');
    await GET(searchReq('quantum'));
    expect(db.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }));
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }));
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }));
  });
});

describe('canAccessObjectChat', () => {
  it('grants a project thread via canViewProject (creator)', async () => {
    const { canAccessObjectChat } = await import('@/lib/teams');
    db.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1', teamId: 't1' });
    expect(await canAccessObjectChat('t1', 'u1', 'project:p1')).toBe(true);
  });

  it('denies a project thread when the teamId in the URL does not match the project\'s own team', async () => {
    const { canAccessObjectChat } = await import('@/lib/teams');
    db.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', teamId: 't1' });
    expect(await canAccessObjectChat('t2', 'stranger', 'project:p1')).toBe(false);
  });

  it('grants a task thread to the task\'s own assignee even without separate project access', async () => {
    const { canAccessObjectChat } = await import('@/lib/teams');
    db.task.findUnique.mockResolvedValue({ id: 'tk1', userId: 'assignee1', assignedById: 'boss1', projectId: 'p1' });
    expect(await canAccessObjectChat('t1', 'assignee1', 'task:tk1')).toBe(true);
  });

  it('denies a malformed conversationKey', async () => {
    const { canAccessObjectChat } = await import('@/lib/teams');
    expect(await canAccessObjectChat('t1', 'u1', 'not-a-valid-key')).toBe(false);
  });
});

describe('OBJECT-scope chat (/api/teams/[id]/chat)', () => {
  const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) }) as never;
  const chatGetReq = (qs: string) => ({ url: `http://localhost/api/teams/t1/chat?${qs}` }) as never;

  it('404 when the caller cannot view the linked project', async () => {
    getSessionUser.mockResolvedValue({ userId: 'stranger' });
    db.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', teamId: 't1' });
    db.projectCollaborator.findMany.mockResolvedValue([]);
    db.teamMembership.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/teams/[id]/chat/route');
    const res = await GET(chatGetReq('scope=OBJECT&objectType=project&objectId=p1'), p({ id: 't1' }));
    expect(res.status).toBe(404);
  });

  it('200 and fetches by the derived conversationKey for the project owner', async () => {
    getSessionUser.mockResolvedValue({ userId: 'owner' });
    db.project.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', teamId: 't1' });
    db.chatMessage.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/teams/[id]/chat/route');
    const res = await GET(chatGetReq('scope=OBJECT&objectType=project&objectId=p1'), p({ id: 't1' }));
    expect(res.status).toBe(200);
    expect(db.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId: 't1', scope: 'OBJECT', conversationKey: 'project:p1' }
    }));
  });

  it('GET with q searches text within the resolved conversation only', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.teamMembership.findMany.mockResolvedValue([{ teamId: 't1', userId: 'u1', role: 'MEMBER' }]);
    db.chatMessage.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/teams/[id]/chat/route');
    await GET(chatGetReq('scope=TEAM&q=hello'), p({ id: 't1' }));
    expect(db.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId: 't1', scope: 'TEAM', conversationKey: '', text: { contains: 'hello', mode: 'insensitive' } }
    }));
  });

  it('POST with mentionedUserIds notifies a real teammate, never the sender themselves', async () => {
    getSessionUser.mockResolvedValue({ userId: 'sender1' });
    db.teamMembership.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === 'mentioned1' ? [{ teamId: 't1', userId: 'mentioned1', role: 'MEMBER' }] : [{ teamId: 't1', userId: 'sender1', role: 'MEMBER' }])
    );
    db.chatMessage.create.mockResolvedValue({ id: 'm1', teamId: 't1', scope: 'TEAM', conversationKey: '', senderId: 'sender1', text: 'hi @Mentioned', createdAt: new Date().toISOString() });
    db.user.findUnique.mockResolvedValue({ id: 'sender1', name: 'Sender', email: 's@x.com' });
    const { POST } = await import('@/app/api/teams/[id]/chat/route');
    const res = await POST(req({ scope: 'TEAM', text: 'hi @Mentioned', mentionedUserIds: ['mentioned1', 'sender1'] }, 'http://localhost/api/x'), p({ id: 't1' }));
    expect(res.status).toBe(200);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'mentioned1', type: 'CHAT_MENTION' })
    }));
  });

  it('POST with mentionedUserIds skips anyone who is not actually a team member', async () => {
    getSessionUser.mockResolvedValue({ userId: 'sender1' });
    db.teamMembership.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === 'sender1' ? [{ teamId: 't1', userId: 'sender1', role: 'MEMBER' }] : [])
    );
    db.chatMessage.create.mockResolvedValue({ id: 'm2', teamId: 't1', scope: 'TEAM', conversationKey: '', senderId: 'sender1', text: 'hi', createdAt: new Date().toISOString() });
    db.user.findUnique.mockResolvedValue({ id: 'sender1', name: 'Sender', email: 's@x.com' });
    const { POST } = await import('@/app/api/teams/[id]/chat/route');
    const res = await POST(req({ scope: 'TEAM', text: 'hi', mentionedUserIds: ['not-a-member'] }, 'http://localhost/api/x'), p({ id: 't1' }));
    expect(res.status).toBe(200);
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('POST with mentionedUserIds never notifies a real teammate who is not a participant of this specific DIRECT thread', async () => {
    getSessionUser.mockResolvedValue({ userId: 'sender1' });
    // sender1, other1, and third1 are all real team members - only sender1
    // and other1 are participants of the DIRECT thread being posted to.
    db.teamMembership.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(['sender1', 'other1', 'third1'].includes(where.userId) ? [{ teamId: 't1', userId: where.userId, role: 'MEMBER' }] : [])
    );
    db.chatMessage.create.mockResolvedValue({ id: 'm3', teamId: 't1', scope: 'DIRECT', conversationKey: 'other1_sender1', senderId: 'sender1', text: 'hi @Third', createdAt: new Date().toISOString() });
    db.user.findUnique.mockResolvedValue({ id: 'sender1', name: 'Sender', email: 's@x.com' });
    const { POST } = await import('@/app/api/teams/[id]/chat/route');
    const res = await POST(req({ scope: 'DIRECT', with: 'other1', text: 'hi @Third', mentionedUserIds: ['third1'] }, 'http://localhost/api/x'), p({ id: 't1' }));
    expect(res.status).toBe(200);
    // third1 is a real teammate (getMembership would say yes) but not a
    // participant of this DM - must not be notified with a preview of a
    // private conversation they can't open.
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('notification preferences', () => {
  it('isNotificationTypeEnabled defaults to true with no Setting row', async () => {
    const { isNotificationTypeEnabled } = await import('@/lib/notify');
    db.setting.findUnique.mockResolvedValue(null);
    expect(await isNotificationTypeEnabled('u1', 'WEEKLY_DIGEST')).toBe(true);
  });

  it('isNotificationTypeEnabled defaults to true for a type with no explicit entry', async () => {
    const { isNotificationTypeEnabled } = await import('@/lib/notify');
    db.setting.findUnique.mockResolvedValue({ notificationPreferences: { TASK_BLOCKED: false } });
    expect(await isNotificationTypeEnabled('u1', 'WEEKLY_DIGEST')).toBe(true);
  });

  it('isNotificationTypeEnabled returns false when explicitly turned off', async () => {
    const { isNotificationTypeEnabled } = await import('@/lib/notify');
    db.setting.findUnique.mockResolvedValue({ notificationPreferences: { WEEKLY_DIGEST: false } });
    expect(await isNotificationTypeEnabled('u1', 'WEEKLY_DIGEST')).toBe(false);
  });

  it('createNotification is a no-op for a disabled type', async () => {
    const { createNotification } = await import('@/lib/notify');
    db.setting.findUnique.mockResolvedValue({ notificationPreferences: { TASK_ASSIGNED: false } });
    await createNotification({ userId: 'u1', type: 'TASK_ASSIGNED', title: 'x', sourceType: 'Task' });
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('POST /api/notifications returns {skipped:true} and does not write for a disabled type', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.setting.findUnique.mockResolvedValue({ notificationPreferences: { TASK_REMINDER: false } });
    const { POST } = await import('@/app/api/notifications/route');
    const res = await POST(req({ type: 'TASK_REMINDER', title: 'x', sourceType: 'Task' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: true });
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/tasks - the day a date means', () => {
  // A stored task date is local midnight as a UTC timestamp: 16 Oct in IST is
  // 2026-10-15T18:30Z. Posting that back (as Duplicate used to) must land on
  // the 16th, not the UTC date.
  const create = async (date: string) => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    db.user.findUnique.mockResolvedValue({ id: 'u1', timezone: 'Asia/Kolkata' });
    db.task.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data }));
    db.task.findUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tasks/route');
    const res = await POST(req({ name: 'Copy', date }));
    expect(res.status).toBeLessThan(300);
    return (db.task.create.mock.calls[0][0] as { data: { date: Date } }).data.date.toISOString();
  };

  it('a plain day is that day in the account zone', async () => {
    expect(await create('2026-10-16')).toBe('2026-10-15T18:30:00.000Z');
  });

  it('a full UTC timestamp is read in the account zone, not cut to its UTC date', async () => {
    expect(await create('2026-10-15T18:30:00.000Z')).toBe('2026-10-15T18:30:00.000Z');
  });
});

describe('POST /api/tasks/reorder', () => {
  const updateMany = vi.fn();
  beforeEach(() => {
    (db.task as Record<string, unknown>).updateMany = updateMany;
    updateMany.mockReset();
  });

  it('401 signed out', async () => {
    const { POST } = await import('@/app/api/tasks/reorder/route');
    expect((await POST(req({ orders: [{ id: 't1', manualOrder: 1 }] }))).status).toBe(401);
  });

  it('writes only manualOrder, only on the caller\'s own tasks', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const { POST } = await import('@/app/api/tasks/reorder/route');
    const res = await POST(req({ orders: [{ id: 'mine', manualOrder: 1.5 }, { id: 'theirs', manualOrder: 2 }] }));
    expect(await res.json()).toEqual({ updated: 1 });
    expect(updateMany).toHaveBeenNthCalledWith(1, { where: { id: 'mine', userId: 'u1' }, data: { manualOrder: 1.5 } });
    expect(updateMany).toHaveBeenNthCalledWith(2, { where: { id: 'theirs', userId: 'u1' }, data: { manualOrder: 2 } });
  });

  it('rejects anything but finite numbers', async () => {
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/tasks/reorder/route');
    expect((await POST(req({ orders: [{ id: 't', manualOrder: 'first' }] }))).status).toBe(400);
    expect((await POST(req({ orders: [] }))).status).toBe(400);
    expect((await POST(req({ orders: [{ id: 't', manualOrder: 1, priority: 'HIGH' }] }))).status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 't', userId: 'u1' }, data: { manualOrder: 1 } });
  });
});
