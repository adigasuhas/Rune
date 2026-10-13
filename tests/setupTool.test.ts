import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs the real `scripts/setup.mjs` non-interactively (--skip-db, so no
 * database is touched) against a temp file, and checks what it writes.
 */
const script = path.resolve(__dirname, '..', 'scripts', 'setup.mjs');
let dir: string;
let out: string;

const setup = (...args: string[]) =>
  spawnSync(process.execPath, [script, '--yes', '--skip-db', '--out', out, ...args], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
const parse = (file = out) =>
  Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rune-setup-'));
  out = path.join(dir, 'rune.env');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('npm run setup (non-interactive)', () => {
  it('local target: sets the port, the base URL derived from it, a strong secret, and a safe sign-up default', () => {
    const r = setup('--target', 'local', '--port', '3111', '--db', 'bundled', '--no-smtp');
    expect(r.status).toBe(0);
    const env = parse();
    expect(env.PORT).toBe('3111');
    expect(env.RUNE_BASE_URL).toBe('http://localhost:3111');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@127.0.0.1:5432/postgres');
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.RUNE_SIGNUP_MODE).toBe('open'); // local try-out
    expect(env.SMTP_HOST).toBeUndefined(); // email stays off
    expect(fs.statSync(out).mode & 0o777).toBe(0o600); // secrets file isn't world-readable
  });

  it('hosted target: defaults sign-ups to CLOSED and writes a copy-paste file, not .env', () => {
    const r = setup('--target', 'vercel', '--url', 'https://my-rune.vercel.app/', '--database-url', 'postgresql://u:p@h/db', '--admin-email', 'me@x.io');
    expect(r.status).toBe(0);
    const env = parse();
    expect(env.RUNE_BASE_URL).toBe('https://my-rune.vercel.app'); // normalised
    expect(env.RUNE_SIGNUP_MODE).toBe('closed');
    expect(env.PORT).toBeUndefined();
    expect(env.DATABASE_URL).toBe('postgresql://u:p@h/db');
    // --skip-db means no account gets created here, so the admin address is
    // listed and registers in the browser instead (allowed even though closed)
    expect(env.RUNE_ADMIN_EMAILS).toBe('me@x.io');
    expect(r.stdout).toMatch(/copy each KEY=value/i);
    expect(r.stdout).toMatch(/prisma migrate deploy && next build/);
  });

  it('docker/VPS with the bundled compose database: generates POSTGRES_PASSWORD and lists the admin for browser registration', () => {
    const r = setup('--target', 'vps', '--url', 'https://rune.example.com', '--db', 'compose', '--admin-email', 'Boss@Example.com');
    expect(r.status).toBe(0);
    const env = parse();
    expect(env.POSTGRES_PASSWORD.length).toBeGreaterThanOrEqual(24);
    expect(env.DATABASE_URL).toBeUndefined(); // compose builds it itself
    expect(env.RUNE_ADMIN_EMAILS).toBe('boss@example.com');
    expect(r.stdout).toMatch(/register[\s\S]*boss@example\.com/);
  });

  it('domains mode normalises the list and requires one', () => {
    const ok = setup('--target', 'local', '--signup', 'domains', '--domains', 'Lab.edu, @Company.com');
    expect(ok.status).toBe(0);
    expect(parse().RUNE_ALLOWED_EMAIL_DOMAINS).toBe('lab.edu,company.com');
    fs.rmSync(out); // otherwise it (correctly) falls back to the domains already in the file
    const bad = setup('--target', 'local', '--signup', 'domains');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/--domains is required/);
  });

  it('re-running keeps the existing JWT_SECRET, preserves unrelated keys and comments, and backs the file up', () => {
    fs.writeFileSync(out, '# my notes\nSOME_OTHER_VAR=keepme\nJWT_SECRET=' + 'k'.repeat(40) + '\nFOO=bar\n');
    const r = setup('--target', 'local', '--port', '3200', '--no-smtp');
    expect(r.status).toBe(0);
    const text = fs.readFileSync(out, 'utf8');
    expect(text).toContain('# my notes');
    const env = parse();
    expect(env.JWT_SECRET).toBe('k'.repeat(40)); // sessions survive
    expect(env.SOME_OTHER_VAR).toBe('keepme');
    expect(env.FOO).toBe('bar');
    expect(env.PORT).toBe('3200');
    expect(fs.readdirSync(dir).some((f) => f.startsWith('rune.env.backup-'))).toBe(true);
  });

  it('--rotate-secret replaces it on request', () => {
    fs.writeFileSync(out, 'JWT_SECRET=' + 'k'.repeat(40) + '\n');
    setup('--target', 'local', '--rotate-secret', '--no-smtp');
    expect(parse().JWT_SECRET).not.toBe('k'.repeat(40));
  });

  it('SMTP: enables it when given a host, clears it with --no-smtp', () => {
    setup('--target', 'local', '--smtp-host', 'smtp.example.com', '--smtp-from', 'rune@example.com');
    expect(parse()).toMatchObject({ SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'rune@example.com' });
    setup('--target', 'local', '--no-smtp');
    expect(parse().SMTP_HOST).toBe('');
  });

  it('does not download the local dictation model by default in non-interactive mode', () => {
    const r = setup('--target', 'local', '--no-smtp');
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/Downloading the local dictation model/);
  });

  it('rejects bad input with a clear message instead of writing a broken config', () => {
    const port = setup('--target', 'local', '--port', '99999');
    expect(port.status).toBe(1);
    expect(port.stderr).toMatch(/Port must be/);
    const url = setup('--target', 'vercel', '--url', 'not-a-url', '--database-url', 'postgresql://u:p@h/db');
    expect(url.status).toBe(1);
    expect(url.stderr).toMatch(/--url must be a full http\(s\) URL/);
    const db = setup('--target', 'netlify', '--url', 'https://a.netlify.app', '--database-url', 'mysql://x');
    expect(db.status).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
  });
});
