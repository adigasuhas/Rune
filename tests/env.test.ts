import { describe, it, expect, afterEach, vi } from 'vitest';
import { checkEnv } from '@/lib/env';

afterEach(() => vi.unstubAllEnvs());

describe('checkEnv — production gate', () => {
  const prod = () => {
    vi.stubEnv('NODE_ENV', 'production');
  };

  it('fails when JWT_SECRET / DATABASE_URL are missing', () => {
    prod();
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('DATABASE_URL', '');
    const r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/JWT_SECRET/);
    expect(r.errors.join(' ')).toMatch(/DATABASE_URL/);
  });

  it('boots in production with nothing but the required vars — email + password needs nothing else', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@h:5432/db');
    vi.stubEnv('RUNE_BASE_URL', 'https://rune.example.com');
    vi.stubEnv('RUNE_SIGNUP_MODE', 'closed');
    vi.stubEnv('S3_BUCKET', 'b');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    const r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('warns when SMTP is not configured (reset links fall back to the console)', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@h:5432/db');
    vi.stubEnv('RUNE_BASE_URL', 'https://rune.example.com');
    vi.stubEnv('RUNE_SIGNUP_MODE', 'closed');
    vi.stubEnv('S3_BUCKET', 'b');
    vi.stubEnv('SMTP_HOST', '');
    const r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/SMTP is not configured/);
  });

  it('warns (not errors) when RUNE_BASE_URL is unset or http on a real host, and when sign-ups are open', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@h:5432/db');
    vi.stubEnv('S3_BUCKET', 'b');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('RUNE_BASE_URL', '');
    vi.stubEnv('RUNE_SIGNUP_MODE', '');
    let r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/RUNE_BASE_URL is not set/);
    expect(r.warnings.join(' ')).toMatch(/anyone who can reach this site can create an account/);
    vi.stubEnv('RUNE_BASE_URL', 'http://rune.example.com');
    r = checkEnv();
    expect(r.warnings.join(' ')).toMatch(/plain http/);
    vi.stubEnv('RUNE_BASE_URL', 'http://localhost:3000'); // local is fine
    expect(checkEnv().warnings.join(' ')).not.toMatch(/plain http/);
  });

  it('a malformed RUNE_BASE_URL or sign-up mode stops a production deploy, but only warns in dev', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@h:5432/db');
    vi.stubEnv('RUNE_BASE_URL', 'rune.example.com'); // missing scheme
    vi.stubEnv('RUNE_SIGNUP_MODE', 'opne');
    let r = checkEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not a valid http\(s\) URL/);
    expect(r.errors.join(' ')).toMatch(/RUNE_SIGNUP_MODE="opne"/);

    vi.stubEnv('NODE_ENV', 'development');
    r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/RUNE_SIGNUP_MODE="opne"/);
  });

  it('rejects a weak JWT_SECRET', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'changeme');
    vi.stubEnv('DATABASE_URL', 'postgresql://x');
    expect(checkEnv().ok).toBe(false);
  });

  it('passes with a full production config', () => {
    prod();
    vi.stubEnv('JWT_SECRET', 'a'.repeat(48));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@h:5432/db');
    vi.stubEnv('S3_BUCKET', 'b');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    const r = checkEnv();
    expect(r.ok).toBe(true);
  });

  it('development still needs DATABASE_URL, but nothing else', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('DATABASE_URL', '');
    expect(checkEnv().ok).toBe(false); // Postgres is always required now

    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
    const r = checkEnv();
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/JWT_SECRET/); // warned, not errored
  });
});
