import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Sign-up and the public auth config. `@/lib/auth` and `@/lib/db` are mocked
 * so the real handlers (validation, policy, rate limiting) run without a
 * database.
 */
const setSessionCookie = vi.fn();
const invalidateSessionCache = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSessionUser: vi.fn(),
  setSessionCookie: (...a: unknown[]) => setSessionCookie(...a),
  invalidateSessionCache: (...a: unknown[]) => invalidateSessionCache(...a),
  clearSessionCookie: vi.fn(),
}));

const db = {
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock('@/lib/db', () => ({ db }));

const sendMail = vi.fn();
vi.mock('@/lib/mailer', () => ({
  isSmtpConfigured: () => Boolean(process.env.SMTP_HOST),
  sendMail: (...a: unknown[]) => sendMail(...a),
}));

let ip = 0;
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}` },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RUNE_SIGNUP_MODE', '');
  vi.stubEnv('RUNE_ALLOWED_EMAIL_DOMAINS', '');
  vi.stubEnv('RUNE_ADMIN_EMAILS', '');
  vi.stubEnv('RUNE_BASE_URL', '');
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-id', sessionVersion: 0, ...data }));
});
afterEach(() => vi.unstubAllEnvs());

const GOOD = 'Correct-Horse-Battery-9';
const R = { recoveryQuestion: 'first-pet', recoveryAnswer: 'Biscuit' };

describe('POST /api/auth/signup', () => {
  const run = async (body: unknown) => (await import('@/app/api/auth/signup/route')).POST(post('/api/auth/signup', body));

  it('creates an account with email + password', async () => {
    const res = await run({ email: 'Ada@Example.COM', password: GOOD, name: ' Ada ', ...R });
    expect(res.status).toBe(200);
    const created = db.user.create.mock.calls[0][0].data;
    expect(created.email).toBe('ada@example.com'); // normalised
    expect(created.name).toBe('Ada');
    expect(created.passwordHash).toBeTruthy();
    expect(created.passwordHash).not.toContain(GOOD); // hashed, never stored
    expect(created.role).toBeUndefined(); // self-signup never grants admin
    expect(created.recoveryQuestion).toBe('first-pet');
    expect(created.recoveryAnswerHash).toBeTruthy();
    expect(created.recoveryAnswerHash).not.toMatch(/biscuit/i); // hashed, never stored
    expect(setSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ userId: 'new-id', email: 'ada@example.com' }));
  });

  it('keeps the browser time zone if it is a real one, and ignores junk', async () => {
    await run({ email: 'tz@example.com', password: GOOD, timezone: 'Asia/Kolkata', ...R });
    expect(db.user.create.mock.calls[0][0].data.timezone).toBe('Asia/Kolkata');
    await run({ email: 'tz2@example.com', password: GOOD, timezone: 'Mars/Olympus', ...R });
    expect(db.user.create.mock.calls[1][0].data.timezone).toBeUndefined();
  });

  it('400 on a malformed email or missing fields', async () => {
    expect((await run({ email: 'nope', password: GOOD, ...R })).status).toBe(400);
    expect((await run({})).status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('400 with a specific message for weak passwords', async () => {
    const short = await run({ email: 'a@x.io', password: 'short' });
    expect(short.status).toBe(400);
    expect((await short.json()).error).toMatch(/at least 10/);
    const common = await run({ email: 'b@x.io', password: 'password123' });
    expect((await common.json()).error).toMatch(/too common/);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('400 naming the field when the recovery question or answer is missing or unusable', async () => {
    const noQ = await run({ email: 'q@x.io', password: GOOD, recoveryAnswer: 'Biscuit' });
    expect(noQ.status).toBe(400);
    expect(await noQ.json()).toMatchObject({ field: 'recoveryQuestion' });
    const badQ = await run({ email: 'q@x.io', password: GOOD, recoveryQuestion: 'made-up', recoveryAnswer: 'Biscuit' });
    expect(await badQ.json()).toMatchObject({ field: 'recoveryQuestion' });
    const short = await run({ email: 'q@x.io', password: GOOD, recoveryQuestion: 'first-pet', recoveryAnswer: ' . ' });
    expect(await short.json()).toMatchObject({ field: 'recoveryAnswer' });
    const same = await run({ email: 'q@x.io', password: GOOD, recoveryQuestion: 'first-pet', recoveryAnswer: GOOD });
    expect(await same.json()).toMatchObject({ field: 'recoveryAnswer' });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('503 with an actionable message (not a vague 500) when the database is unreachable', async () => {
    db.user.findUnique.mockRejectedValueOnce(Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' }));
    const res = await run({ email: 'down@x.io', password: GOOD, ...R });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'db_unavailable' });
  });

  it('409 when the address is taken — and says how to get in', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u', email: 'a@x.io', passwordHash: 'h' });
    const res = await run({ email: 'a@x.io', password: GOOD, ...R });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Sign in instead/);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('409 (not a 500) when two sign-ups race on the unique index', async () => {
    db.user.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect((await run({ email: 'race@x.io', password: GOOD, ...R })).status).toBe(409);
  });

  describe('sign-up policy', () => {
    it('closed: 403 with a code, nothing created', async () => {
      vi.stubEnv('RUNE_SIGNUP_MODE', 'closed');
      const res = await run({ email: 'a@x.io', password: GOOD, ...R });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'signup_closed' });
      expect(db.user.create).not.toHaveBeenCalled();
    });
    it('domains: only approved domains', async () => {
      vi.stubEnv('RUNE_SIGNUP_MODE', 'domains');
      vi.stubEnv('RUNE_ALLOWED_EMAIL_DOMAINS', 'lab.edu');
      const bad = await run({ email: 'a@gmail.com', password: GOOD, ...R });
      expect(bad.status).toBe(403);
      expect(await bad.json()).toMatchObject({ code: 'signup_domain' });
      expect((await run({ email: 'a@lab.edu', password: GOOD, ...R })).status).toBe(200);
    });
    it('closed still lets a RUNE_ADMIN_EMAILS address register (first-admin bootstrap)', async () => {
      vi.stubEnv('RUNE_SIGNUP_MODE', 'closed');
      vi.stubEnv('RUNE_ADMIN_EMAILS', 'boss@x.io');
      expect((await run({ email: 'Boss@x.io', password: GOOD, ...R })).status).toBe(200);
      expect((await run({ email: 'other@x.io', password: GOOD, ...R })).status).toBe(403);
    });
    it('a typo in the mode fails closed', async () => {
      vi.stubEnv('RUNE_SIGNUP_MODE', 'opne');
      expect((await run({ email: 'a@x.io', password: GOOD, ...R })).status).toBe(403);
    });
  });

  it('rate limits repeated attempts for one address (429 with Retry-After)', async () => {
    let last!: Response;
    for (let i = 0; i < 6; i++) last = await run({ email: 'hammer@x.io', password: 'short' });
    expect(last.status).toBe(429);
    expect(last.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('GET /api/auth/config', () => {
  it('reports only what the login screen needs — never the domain list', async () => {
    vi.stubEnv('RUNE_SIGNUP_MODE', 'domains');
    vi.stubEnv('RUNE_ALLOWED_EMAIL_DOMAINS', 'private-lab.edu');
    const { GET } = await import('@/app/api/auth/config/route');
    const body = await (await GET()).json();
    expect(body).toEqual({ signup: 'domains', emailReset: false });
    expect(JSON.stringify(body)).not.toMatch(/private-lab/);
  });
});

describe('POST /api/auth/forgot-password', () => {
  const run = async (body: unknown) => (await import('@/app/api/auth/forgot-password/route')).POST(post('/api/auth/forgot-password', body));

  it('issues a token and emails it when SMTP is configured, for a real account', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    sendMail.mockResolvedValue(true);
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.io', status: 'ACTIVE', deletedAt: null, sessionVersion: 0 });
    db.user.update.mockResolvedValue({});
    const res = await run({ email: 'A@X.io' });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ passwordResetTokenHash: expect.any(String), passwordResetTokenExpiresAt: expect.any(Date) }),
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.io' }));
    expect((await res.json()).message).toMatch(/sent a reset link/);
  });

  it('returns the exact same response for an email that does not exist — no enumeration', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    db.user.findUnique.mockResolvedValue(null);
    const res = await run({ email: 'nobody@x.io' });
    expect(res.status).toBe(200);
    expect(db.user.update).not.toHaveBeenCalled();
    expect((await res.json()).message).toMatch(/sent a reset link/);
  });

  it('falls back to a console-logged link when SMTP is not configured, but still succeeds', async () => {
    vi.stubEnv('SMTP_HOST', '');
    sendMail.mockResolvedValue(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.io', status: 'ACTIVE', deletedAt: null, sessionVersion: 0 });
    db.user.update.mockResolvedValue({});
    const res = await run({ email: 'a@x.io' });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/ask your administrator/i);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('a@x.io'));
    logSpy.mockRestore();
  });

  it('rate limits repeated attempts for one address', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    db.user.findUnique.mockResolvedValue(null);
    let last!: Response;
    for (let i = 0; i < 4; i++) last = await run({ email: 'hammer@x.io' });
    expect(last.status).toBe(429);
  });
});

describe('forgot-password for the built-in developer account', () => {
  it('never emails its reset link, even with SMTP configured (the address is at a domain operators don\'t own)', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.org');
    db.user.findUnique.mockResolvedValue({ id: 'dev', email: 'developer_adiga@rune.io', status: 'ACTIVE', deletedAt: null });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(post('/api/auth/forgot-password', { email: 'developer_adiga@rune.io' }));
    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
    expect(log.mock.calls.some((c) => String(c[0]).includes('[password-reset]'))).toBe(true);
    log.mockRestore();
  });
});

describe('POST /api/auth/reset-password', () => {
  const run = async (body: unknown) => (await import('@/app/api/auth/reset-password/route')).POST(post('/api/auth/reset-password', body));

  it('rejects an unknown or expired token', async () => {
    db.user.findUnique.mockResolvedValue(null); // resolvePasswordResetToken finds no matching hash
    const res = await run({ token: 'nope', newPassword: GOOD });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('resets the password, clears the token, bumps sessionVersion, and never touches role', async () => {
    const user = {
      id: 'u1', email: 'a@x.io', deletedAt: null, sessionVersion: 3,
      passwordResetTokenHash: 'irrelevant-because-resolve-is-mocked', passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    db.user.findUnique.mockResolvedValue(user);
    db.user.update.mockResolvedValue({ ...user, sessionVersion: 4 });
    const res = await run({ token: 'a-valid-looking-token', newPassword: GOOD });
    expect(res.status).toBe(200);
    const data = db.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBeTruthy();
    expect(data.passwordResetTokenHash).toBeNull();
    expect(data.sessionVersion).toBe(4);
    expect('role' in data).toBe(false);
    expect(invalidateSessionCache).toHaveBeenCalledWith('u1');
  });

  it('400 on a weak new password, without consuming the token', async () => {
    const user = { id: 'u1', email: 'a@x.io', deletedAt: null, sessionVersion: 0, passwordResetTokenExpiresAt: new Date(Date.now() + 60_000) };
    db.user.findUnique.mockResolvedValue(user);
    const res = await run({ token: 'a-valid-looking-token', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('secret-question recovery', () => {
  const question = async (body: unknown) => (await import('@/app/api/auth/recovery/question/route')).POST(post('/api/auth/recovery/question', body));
  const verify = async (body: unknown) => (await import('@/app/api/auth/recovery/verify/route')).POST(post('/api/auth/recovery/verify', body));

  const account = async () => {
    const { hashAnswer } = await import('@/lib/recovery');
    return {
      id: 'u9', email: 'kai@x.io', status: 'ACTIVE', deletedAt: null,
      recoveryQuestion: 'emergency-coffee', recoveryAnswerHash: hashAnswer('Filter coffee, extra strong'),
    };
  };

  it('normalises answers: case, accents, punctuation and spacing do not matter', async () => {
    const { normalizeAnswer, hashAnswer, verifyAnswer } = await import('@/lib/recovery');
    expect(normalizeAnswer("  St. Mary's  School ")).toBe('st mary s school');
    expect(normalizeAnswer('Café')).toBe('cafe');
    const h = hashAnswer('Filter coffee, extra strong');
    expect(verifyAnswer('filter coffee extra strong', h)).toBe(true);
    expect(verifyAnswer('FILTER-COFFEE  EXTRA STRONG!', h)).toBe(true);
    expect(verifyAnswer('filter coffee', h)).toBe(false);
  });

  it("returns the account's own question - and never anything about the answer", async () => {
    db.user.findUnique.mockResolvedValue(await account());
    const res = await question({ email: 'Kai@X.io' });
    const body = await res.json();
    expect(body.question.id).toBe('emergency-coffee');
    expect(JSON.stringify(body)).not.toMatch(/hash|filter|strong/i);
  });

  it('returns a stable decoy for an unknown email, so it cannot be used to find accounts', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const a = await (await question({ email: 'ghost@x.io' })).json();
    const b = await (await question({ email: 'ghost@x.io' })).json();
    expect(a.question.id).toBeTruthy();
    expect(a).toEqual(b);
  });

  it('a correct answer yields a one-time reset token valid for 15 minutes', async () => {
    db.user.findUnique.mockResolvedValue(await account());
    const res = await verify({ email: 'kai@x.io', answer: 'filter coffee — extra strong' });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBeTruthy();
    const data = db.user.update.mock.calls[0][0].data;
    expect(data.passwordResetTokenHash).toBeTruthy();
    const ttl = data.passwordResetTokenExpiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000);
  });

  it('wrong answer, unknown email and "no question set" all get the same 400', async () => {
    db.user.findUnique.mockResolvedValueOnce(await account());
    const wrong = await verify({ email: 'kai@x.io', answer: 'tea' });
    db.user.findUnique.mockResolvedValueOnce(null);
    const ghost = await verify({ email: 'ghost@x.io', answer: 'tea' });
    db.user.findUnique.mockResolvedValueOnce({ ...(await account()), recoveryAnswerHash: null });
    const unset = await verify({ email: 'kai@x.io', answer: 'tea' });
    const bodies = await Promise.all([wrong, ghost, unset].map((r) => r.json()));
    expect([wrong.status, ghost.status, unset.status]).toEqual([400, 400, 400]);
    expect(new Set(bodies.map((b) => b.error)).size).toBe(1);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('a suspended account cannot recover', async () => {
    db.user.findUnique.mockResolvedValue({ ...(await account()), status: 'SUSPENDED' });
    expect((await verify({ email: 'kai@x.io', answer: 'filter coffee extra strong' })).status).toBe(400);
  });

  it('caps guesses per address (429 after 5)', async () => {
    db.user.findUnique.mockResolvedValue(await account());
    let last!: Response;
    for (let i = 0; i < 6; i++) last = await verify({ email: 'capped@x.io', answer: 'guess' + i });
    expect(last.status).toBe(429);
  });
});
