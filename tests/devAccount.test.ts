import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = { user: { findUnique: vi.fn(), create: vi.fn() } };
vi.mock('@/lib/db', () => ({ db }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ensureDeveloperAccount', () => {
  it('creates the built-in developer account with role DEVELOPER when missing', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: 'dev-1' });
    const { ensureDeveloperAccount, DEVELOPER_EMAIL } = await import('@/lib/devAccount');
    await ensureDeveloperAccount();
    expect(db.user.create).toHaveBeenCalledTimes(1);
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.email).toBe(DEVELOPER_EMAIL);
    expect(data.role).toBe('DEVELOPER');
    expect(data.passwordHash).toBeTruthy();
    expect(data.passwordHash).not.toContain('developer12345'); // hashed, never stored plain
  });

  it('is a no-op when the account already exists — never resets a changed password', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'dev-1', email: 'developer_adiga@rune.io' });
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    await ensureDeveloperAccount();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('swallows a P2002 race from a concurrent boot instead of throwing', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    await expect(ensureDeveloperAccount()).resolves.toBeUndefined();
  });

  it('never throws on an unexpected database error — boot must not crash', async () => {
    db.user.findUnique.mockRejectedValue(new Error('db unreachable'));
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    await expect(ensureDeveloperAccount()).resolves.toBeUndefined();
  });
});

describe('built-in developer account in production (default password is public)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RUNE_DEVELOPER_PASSWORD', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is not created at all unless RUNE_DEVELOPER_PASSWORD is set', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    await ensureDeveloperAccount();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses a weak or default RUNE_DEVELOPER_PASSWORD', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    for (const weak of ['developer12345', 'short', 'password123']) {
      vi.stubEnv('RUNE_DEVELOPER_PASSWORD', weak);
      await ensureDeveloperAccount();
    }
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('is created with a strong configured password', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: 'dev-1' });
    vi.stubEnv('RUNE_DEVELOPER_PASSWORD', 'a-real-operator-Secret-77');
    const { ensureDeveloperAccount } = await import('@/lib/devAccount');
    const { verifyPassword } = await import('@/lib/crypto');
    await ensureDeveloperAccount();
    expect(verifyPassword('a-real-operator-Secret-77', db.user.create.mock.calls[0][0].data.passwordHash)).toBe(true);
  });

  it('still uses the convenience default in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { developerPasswordForCreation } = await import('@/lib/devAccount');
    expect(developerPasswordForCreation()).toBe('developer12345');
  });

  it('flags the default credential, case-insensitively on the email only', async () => {
    const { isDefaultDeveloperLogin } = await import('@/lib/devAccount');
    expect(isDefaultDeveloperLogin(' Developer_Adiga@Rune.io ', 'developer12345')).toBe(true);
    expect(isDefaultDeveloperLogin('developer_adiga@rune.io', 'Developer12345')).toBe(false);
    expect(isDefaultDeveloperLogin('someone@lab.org', 'developer12345')).toBe(false);
  });
});
