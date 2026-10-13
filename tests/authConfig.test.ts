import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getSignupPolicy, checkSignupAllowed, validatePassword,
} from '@/lib/authConfig';

afterEach(() => vi.unstubAllEnvs());

describe('getSignupPolicy', () => {
  it('defaults to open when unset', () => {
    vi.stubEnv('RUNE_SIGNUP_MODE', '');
    expect(getSignupPolicy().mode).toBe('open');
  });
  it('parses open / closed / domains, case-insensitively', () => {
    vi.stubEnv('RUNE_SIGNUP_MODE', 'CLOSED');
    expect(getSignupPolicy().mode).toBe('closed');
    vi.stubEnv('RUNE_SIGNUP_MODE', 'Domains');
    vi.stubEnv('RUNE_ALLOWED_EMAIL_DOMAINS', ' Lab.edu , @Company.com,, ');
    expect(getSignupPolicy()).toMatchObject({ mode: 'domains', domains: ['lab.edu', 'company.com'] });
  });
  it('fails CLOSED on a typo or an empty domain list — never open', () => {
    vi.stubEnv('RUNE_SIGNUP_MODE', 'opne');
    const typo = getSignupPolicy();
    expect(typo.mode).toBe('closed');
    expect(typo.invalidMode).toBe('opne');
    vi.stubEnv('RUNE_SIGNUP_MODE', 'domains');
    vi.stubEnv('RUNE_ALLOWED_EMAIL_DOMAINS', '');
    expect(getSignupPolicy().mode).toBe('closed');
  });
});

describe('checkSignupAllowed', () => {
  const policy = (mode: 'open' | 'domains' | 'closed', domains: string[] = []) => ({ mode, domains });

  it('open allows anyone', () => {
    expect(checkSignupAllowed('a@anywhere.io', policy('open')).allowed).toBe(true);
  });
  it('closed refuses everyone with a helpful message', () => {
    const d = checkSignupAllowed('a@lab.edu', policy('closed'));
    expect(d).toMatchObject({ allowed: false, reason: 'closed' });
    expect((d as { message: string }).message).toMatch(/administrator/i);
  });
  it('domains admits only listed domains, case-insensitively, and exact-match (no suffix tricks)', () => {
    const p = policy('domains', ['lab.edu']);
    expect(checkSignupAllowed('a@LAB.edu', p).allowed).toBe(true);
    expect(checkSignupAllowed('a@notlab.edu', p).allowed).toBe(false);
    expect(checkSignupAllowed('a@lab.edu.evil.com', p).allowed).toBe(false);
    expect(checkSignupAllowed('a@sub.lab.edu', p).allowed).toBe(false);
    expect(checkSignupAllowed('a@gmail.com', p)).toMatchObject({ allowed: false, reason: 'domain' });
  });
  it('an address in RUNE_ADMIN_EMAILS may always register (bootstrap for hosts with no shell)', () => {
    vi.stubEnv('RUNE_ADMIN_EMAILS', 'Boss@gmail.com, other@x.io');
    expect(checkSignupAllowed('boss@gmail.com', policy('closed')).allowed).toBe(true);
    expect(checkSignupAllowed('boss@gmail.com', policy('domains', ['lab.edu'])).allowed).toBe(true);
    expect(checkSignupAllowed('stranger@gmail.com', policy('closed')).allowed).toBe(false);
  });
});

describe('validatePassword', () => {
  it('enforces length', () => {
    expect(validatePassword('short')).toMatch(/at least 10/);
    expect(validatePassword('a'.repeat(301))).toMatch(/at most/);
  });
  it('rejects the most common passwords even when long enough', () => {
    expect(validatePassword('password123')).toMatch(/too common/);
    expect(validatePassword('Password123')).toMatch(/too common/); // case-insensitive
    expect(validatePassword('1234567890')).toMatch(/too common/);
  });
  it('rejects the account email and single-character repeats', () => {
    expect(validatePassword('ada@example.com', 'ada@example.com')).toMatch(/email/);
    expect(validatePassword('aaaaaaaaaaaa')).toMatch(/repeated/);
  });
  it('accepts a reasonable passphrase', () => {
    expect(validatePassword('Correct-Horse-Battery-9', 'a@b.co')).toBeNull();
  });
});
