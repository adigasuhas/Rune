#!/usr/bin/env node
/**
 * Rune setup - `npm run setup`
 *
 * Asks where Rune will run and writes the configuration for it: the public
 * URL / port (used for redirects), the database, a signing secret, who may
 * sign up, and - only if you want it - outbound email for password-reset
 * links. Then it can create the database tables, your first administrator
 * account, and download the local dictation model.
 *
 * Sign-in is email + password only - nothing external required.
 *
 * Plain Node, no dependencies. Run it as many times as you like: it keeps
 * existing values (never regenerates your JWT_SECRET unless asked) and backs
 * up the file before changing it.
 *
 * Non-interactive (CI / scripts): add --yes and pass answers as flags.
 * See `npm run setup -- --help`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

const has = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  const v = i !== -1 ? argv[i + 1] : undefined;
  return v !== undefined && !v.startsWith('--') ? v : undefined;
};

const YES = has('yes') || has('non-interactive');

const HELP = `
Rune setup

  npm run setup                      interactive (recommended)
  npm run setup -- --yes [flags]     non-interactive

Flags (all optional; missing answers fall back to your existing config, then defaults):
  --target local|vps|vercel|netlify|other   where Rune will run
  --port 3000                               local port (target=local)
  --url https://rune.example.com            public URL (every other target)
  --db bundled|compose|url                  database source
  --db-port 5432                            port of the bundled local database
  --database-url postgresql://...           your own Postgres (--db url)
  --signup open|domains|closed              who may create an account
  --domains example.com,lab.edu             allowed domains (--signup domains)
  --smtp-host ... --smtp-port ... --smtp-from ...   enable emailed password-reset links
  --smtp-user ... --smtp-password ...       SMTP auth, if your server needs it
  --no-smtp                                 explicitly leave email off (reset links go to the console)
  --admin-email you@example.com  --admin-name "You"    first administrator
                                            (password: RUNE_SETUP_ADMIN_PASSWORD env var, or --admin-password)
  --whisper                                 download the local dictation model now
  --skip-whisper                            don't download it (default outside interactive use)
  --skip-db                                 don't run migrations / create the admin
  --out path                                write the config here instead of the default
  --rotate-secret                           generate a new JWT_SECRET (signs everyone out)
`;

if (has('help') || has('h')) {
  console.log(HELP);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------
let muted = false;
const out = new Writable({
  write(chunk, enc, cb) {
    if (!muted) process.stdout.write(chunk, enc);
    cb();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output: out,
  terminal: Boolean(process.stdin.isTTY),
});
const rawQuestion = (q) => new Promise((resolve) => rl.question(q, resolve));

const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const say = (s = '') => console.log(s);
const warn = (s) => console.log(`  ! ${s}`);

async function ask(question, def = '', { flagName } = {}) {
  const fromFlag = flagName ? opt(flagName) : undefined;
  if (fromFlag !== undefined) return fromFlag;
  if (YES) return def;
  const suffix = def ? dim(` [${def}]`) : '';
  const answer = (await rawQuestion(`${question}${suffix}: `)).trim();
  return answer || def;
}

async function askSecret(question, { envName, flagName } = {}) {
  const preset = (flagName && opt(flagName)) || (envName && process.env[envName]);
  if (preset) return preset;
  if (YES) return '';
  process.stdout.write(`${question}: `);
  muted = true;
  const answer = (await rawQuestion('')).trim();
  muted = false;
  process.stdout.write('\n');
  return answer;
}

async function askChoice(question, choices, def, { flagName } = {}) {
  const fromFlag = flagName ? opt(flagName) : undefined;
  if (fromFlag !== undefined) {
    if (!choices.some((c) => c.value === fromFlag)) {
      fail(`--${flagName} must be one of: ${choices.map((c) => c.value).join(', ')}`);
    }
    return fromFlag;
  }
  if (YES) return def;
  say(bold(question));
  choices.forEach((c, i) => say(`  ${i + 1}) ${c.label}${c.value === def ? dim('  (default)') : ''}`));
  while (true) {
    const raw = (await rawQuestion(`Choose 1-${choices.length}${dim(` [${choices.findIndex((c) => c.value === def) + 1}]`)}: `)).trim();
    if (!raw) return def;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
    const byValue = choices.find((c) => c.value === raw.toLowerCase());
    if (byValue) return byValue.value;
    say('  Enter one of the numbers above.');
  }
}

async function askYesNo(question, def, { flagYes, flagNo } = {}) {
  if (flagYes && has(flagYes)) return true;
  if (flagNo && has(flagNo)) return false;
  if (YES) return def;
  const raw = (await rawQuestion(`${question}${dim(def ? ' [Y/n]' : ' [y/N]')}: `)).trim().toLowerCase();
  if (!raw) return def;
  return raw === 'y' || raw === 'yes';
}

function fail(msg) {
  console.error(`\nError: ${msg}\n`);
  rl.close();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// .env file handling (merge, never clobber)
// ---------------------------------------------------------------------------
function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    values.set(m[1], v);
  }
  return values;
}

function formatValue(v) {
  return /[\s#"'\\$]/.test(v) ? JSON.stringify(v) : v;
}

/** Sets KEY=value in-place if a line for KEY exists, else appends. Returns new text. */
function applyEnv(text, updates) {
  let lines = text === '' ? [] : text.split(/\r?\n/);
  const remaining = new Map(Object.entries(updates));
  lines = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && remaining.has(m[2])) {
      const v = remaining.get(m[2]);
      remaining.delete(m[2]);
      return `${m[2]}=${formatValue(v)}`;
    }
    return line;
  });
  if (remaining.size) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push('# --- written by `npm run setup` ---');
    for (const [k, v] of remaining) lines.push(`${k}=${formatValue(v)}`);
  }
  let result = lines.join('\n');
  if (!result.endsWith('\n')) result += '\n';
  return result;
}

const SECRET_KEYS = new Set(['JWT_SECRET', 'SMTP_PASS', 'POSTGRES_PASSWORD', 'S3_SECRET_ACCESS_KEY', 'S3_ACCESS_KEY_ID']);
const mask = (k, v) => (SECRET_KEYS.has(k) ? (v ? '••••••••' : '(empty)') : v === '' ? '(empty)' : v);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
const randomSecret = (bytes) => crypto.randomBytes(bytes).toString('base64url');

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(1500, () => { s.destroy(); resolve(false); });
  });
}

async function waitForPort(port, ms, child) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return false;
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function normalizeOrigin(value) {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

const isLocalHost = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------
async function main() {
  say();
  say(bold('Rune setup'));
  say(dim('Answer a few questions and Rune will be configured for where it runs.'));
  say(dim('Press Enter to accept the value in [brackets].'));
  say();

  const TARGETS = [
    { value: 'local', label: 'On this computer (just for me, or a quick try-out)' },
    { value: 'vps', label: 'My own server or Docker (VPS, home server, Raspberry Pi)' },
    { value: 'vercel', label: 'Vercel' },
    { value: 'netlify', label: 'Netlify' },
    { value: 'other', label: 'Another host (Render, Railway, Fly.io, ...)' },
  ];
  const target = await askChoice('Where will Rune run?', TARGETS, 'local', { flagName: 'target' });

  // File we write. Local and self-hosted use the real .env; dashboard-based
  // hosts get a separate file to copy values from, so production credentials
  // never end up mixed into your laptop's .env.
  const envFile = path.resolve(root, opt('out') || (target === 'local' || target === 'vps' ? '.env' : `.env.${target}`));
  const existingText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const existing = parseEnv(existingText);
  const prev = (k) => existing.get(k) || '';

  const updates = {};
  const cfg = { target };

  // ---- Address ------------------------------------------------------------
  say();
  if (target === 'local') {
    const prevPort = prev('PORT') || (() => { try { return new URL(prev('RUNE_BASE_URL')).port; } catch { return ''; } })();
    const portAnswer = await ask('Which port should Rune use?', prevPort || '3000', { flagName: 'port' });
    const port = Number(portAnswer);
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Port must be a number between 1 and 65535.');
    cfg.port = port;
    cfg.baseUrl = `http://localhost:${port}`;
    updates.PORT = String(port);
  } else {
    say(dim(target === 'vercel'
      ? 'Use your production URL, e.g. https://my-rune.vercel.app or your own domain.'
      : target === 'netlify'
        ? 'Use your site URL, e.g. https://my-rune.netlify.app or your own domain.'
        : 'The public address people will type into a browser, e.g. https://rune.example.com'));
    const defUrl = prev('RUNE_BASE_URL') || '';
    let origin = null;
    while (!origin) {
      const answer = await ask('Public URL of your Rune site', defUrl, { flagName: 'url' });
      origin = answer ? normalizeOrigin(answer) : null;
      if (!origin) {
        if (YES) fail('--url must be a full http(s) URL, e.g. https://rune.example.com');
        say('  That doesn’t look like a URL. Include https://, e.g. https://rune.example.com');
      }
    }
    if (origin.startsWith('http://') && !isLocalHost(origin)) {
      warn('That address uses plain http. Passwords and session cookies would travel unencrypted. Use https unless this is a private network.');
    }
    cfg.baseUrl = origin;
  }
  updates.RUNE_BASE_URL = cfg.baseUrl;

  // ---- Database -----------------------------------------------------------
  say();
  cfg.dbMode = null;
  if (target === 'local') {
    cfg.dbMode = await askChoice('Which database?', [
      { value: 'bundled', label: 'The built-in local database (nothing to install; recommended)' },
      { value: 'url', label: 'A Postgres I already have' },
    ], 'bundled', { flagName: 'db' });
  } else if (target === 'vps') {
    cfg.dbMode = await askChoice('Which database?', [
      { value: 'compose', label: 'The Postgres that comes with docker-compose.yml' },
      { value: 'url', label: 'A Postgres I already have' },
    ], 'compose', { flagName: 'db' });
  } else {
    cfg.dbMode = 'url';
    say(dim(target === 'vercel' || target === 'netlify'
      ? 'This host can’t run a database for you. Use a managed Postgres (Neon, Supabase, Vercel Postgres, ...); most have a free tier.'
      : 'Rune needs a PostgreSQL database.'));
  }

  if (cfg.dbMode === 'bundled') {
    const dbPort = Number(await ask('Port for the built-in database', prev('DATABASE_URL').match(/:(\d+)\//)?.[1] || '5432', { flagName: 'db-port' }));
    if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) fail('Database port must be between 1 and 65535.');
    cfg.dbPort = dbPort;
    cfg.databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
    updates.DATABASE_URL = cfg.databaseUrl;
  } else if (cfg.dbMode === 'compose') {
    updates.POSTGRES_PASSWORD = prev('POSTGRES_PASSWORD') || randomSecret(24);
  } else {
    let url = '';
    while (!/^postgres(ql)?:\/\//.test(url)) {
      url = await ask('Postgres connection string (postgresql://user:password@host:5432/dbname)', prev('DATABASE_URL'), { flagName: 'database-url' });
      if (!/^postgres(ql)?:\/\//.test(url)) {
        if (YES) fail('--database-url must start with postgresql://');
        say('  It should start with postgresql://');
      }
    }
    cfg.databaseUrl = url;
    updates.DATABASE_URL = url;
  }

  // ---- Secret -------------------------------------------------------------
  const keepSecret = prev('JWT_SECRET').length >= 32 && !has('rotate-secret');
  updates.JWT_SECRET = keepSecret ? prev('JWT_SECRET') : randomSecret(48);
  cfg.secretKept = keepSecret;

  // ---- Who may sign up ----------------------------------------------------
  say();
  const prevMode = prev('RUNE_SIGNUP_MODE');
  const defaultMode = prevMode || (target === 'local' ? 'open' : 'closed');
  cfg.signup = await askChoice('Who may create an account?', [
    { value: 'open', label: 'Anyone who can reach the site' },
    { value: 'domains', label: 'Only people with an approved email domain (e.g. your lab or company)' },
    { value: 'closed', label: 'Nobody: I create accounts myself (safest for a public site)' },
  ], defaultMode, { flagName: 'signup' });
  updates.RUNE_SIGNUP_MODE = cfg.signup;
  if (cfg.signup === 'domains') {
    let domains = '';
    while (!domains) {
      domains = (await ask('Approved email domains, comma-separated (e.g. lab.edu,company.com)', prev('RUNE_ALLOWED_EMAIL_DOMAINS'), { flagName: 'domains' }))
        .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean).join(',');
      if (!domains) {
        if (YES) fail('--domains is required with --signup domains.');
        say('  Enter at least one domain.');
      }
    }
    updates.RUNE_ALLOWED_EMAIL_DOMAINS = domains;
  }

  // ---- Email for password resets (optional) --------------------------------
  say();
  say(bold('Outbound email (optional)'));
  say(dim('Not required. "Forgot password?" always works - without email, the reset link is written'));
  say(dim('to the server console for an administrator to relay. Configure SMTP to email it instead.'));
  const hadSmtp = Boolean(prev('SMTP_HOST'));
  let smtpOn;
  if (has('no-smtp')) smtpOn = false;
  else if (opt('smtp-host')) smtpOn = true;
  else if (hadSmtp) smtpOn = await askYesNo(`SMTP is configured (${prev('SMTP_HOST')}). Keep it?`, true);
  else smtpOn = await askYesNo('Set up outbound email now?', false);

  if (smtpOn) {
    const host = await ask('SMTP host', prev('SMTP_HOST'), { flagName: 'smtp-host' });
    const port = await ask('SMTP port', prev('SMTP_PORT') || '587', { flagName: 'smtp-port' });
    const from = await ask('"From" address', prev('SMTP_FROM'), { flagName: 'smtp-from' });
    if (!host || !from) {
      warn('Email needs at least a host and a "From" address, so it was left off.');
      updates.SMTP_HOST = '';
    } else {
      updates.SMTP_HOST = host;
      updates.SMTP_PORT = port;
      updates.SMTP_FROM = from;
      updates.SMTP_USER = await ask('SMTP username (blank if none)', prev('SMTP_USER'), { flagName: 'smtp-user' });
      updates.SMTP_PASS = (await askSecret('SMTP password (blank to keep/leave none)', { flagName: 'smtp-password' })) || prev('SMTP_PASS');
      cfg.smtp = true;
    }
  } else if (hadSmtp) {
    updates.SMTP_HOST = '';
  }

  // ---- Local dictation model (optional) ------------------------------------
  say();
  say(bold('Local dictation (optional)'));
  say(dim('Notebook dictation prefers the browser\'s built-in speech recognition. Downloading the local'));
  say(dim('Whisper model (~150MB, one-time) also enables fully offline dictation as a fallback.'));
  cfg.whisper = has('whisper') ? true : has('skip-whisper') ? false : await askYesNo('Download the local dictation model now?', !YES);

  // ---- File storage for hosts without a persistent disk --------------------
  if (target === 'vercel' || target === 'netlify' || target === 'other') {
    say();
    say(bold('File storage'));
    say(dim('Notebook images and attachments are files. This host has no persistent disk, so they need'));
    say(dim('S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, Supabase Storage, ...).'));
    const wantS3 = await askYesNo('Configure S3-compatible storage now?', Boolean(prev('S3_BUCKET')) || target !== 'other');
    if (wantS3) {
      updates.S3_BUCKET = await ask('Bucket name', prev('S3_BUCKET'));
      updates.S3_ENDPOINT = await ask('Endpoint URL (blank for AWS S3)', prev('S3_ENDPOINT'));
      updates.S3_REGION = await ask('Region', prev('S3_REGION') || 'auto');
      updates.S3_ACCESS_KEY_ID = await ask('Access key ID', prev('S3_ACCESS_KEY_ID'));
      updates.S3_SECRET_ACCESS_KEY = (await askSecret('Secret access key')) || prev('S3_SECRET_ACCESS_KEY');
      updates.S3_PUBLIC_URL_BASE = await ask('Public base URL for files (blank to derive)', prev('S3_PUBLIC_URL_BASE'));
      cfg.s3 = Boolean(updates.S3_BUCKET);
    } else {
      cfg.s3Missing = !prev('S3_BUCKET');
    }
  }

  // ---- Administrator ------------------------------------------------------
  say();
  say(bold('Administrator'));
  const canReachDb = cfg.dbMode !== 'compose' && !has('skip-db');
  let adminEmail = (await ask(
    canReachDb ? 'Email for the first administrator account' : 'Email that should be the administrator',
    (prev('RUNE_ADMIN_EMAILS').split(',')[0] || '').trim(),
    { flagName: 'admin-email' }
  )).toLowerCase();
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    if (YES) fail('--admin-email is not a valid email address.');
    warn('That isn’t a valid email address, so no administrator will be set up.');
    adminEmail = '';
  }
  cfg.adminEmail = adminEmail;
  if (adminEmail && !canReachDb) {
    // No way to write the account from here (the compose database isn't
    // reachable from the host). Listing the address lets its owner register
    // it in the browser even with sign-ups closed, and grants admin.
    updates.RUNE_ADMIN_EMAILS = adminEmail;
    cfg.adminViaRegistration = true;
  }

  // ---- Write --------------------------------------------------------------
  say();
  const changes = [];
  for (const [k, v] of Object.entries(updates)) {
    if (prev(k) !== v) changes.push([k, v, existing.has(k) ? 'updated' : 'added']);
  }
  const newText = applyEnv(existingText, updates);
  if (newText === existingText) {
    say(`${path.relative(root, envFile) || envFile} is already up to date.`);
  } else {
    if (existingText) {
      const backup = `${envFile}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      fs.copyFileSync(envFile, backup);
      say(dim(`Backed up the old file to ${path.relative(root, backup)}`));
    }
    fs.writeFileSync(envFile, newText, { mode: 0o600 });
    say(bold(`Wrote ${path.relative(root, envFile)}`));
    for (const [k, v, what] of changes) say(`  ${what.padEnd(8)} ${k}=${mask(k, v)}`);
    if (cfg.secretKept) say(dim('  (kept your existing JWT_SECRET so nobody is signed out)'));
  }

  // ---- Database + administrator account -----------------------------------
  cfg.dbDone = false;
  if (!has('skip-db') && cfg.dbMode !== 'compose') {
    say();
    const go = await askYesNo(
      cfg.dbMode === 'bundled'
        ? 'Create the database tables' + (adminEmail ? ' and your administrator account' : '') + ' now?'
        : 'Apply the database migrations' + (adminEmail ? ' and create your administrator account' : '') + ' now? (this connects to the database you entered)',
      true
    );
    if (go) cfg.dbDone = await setupDatabase(cfg, adminEmail);
  }

  // ---- Local dictation model ------------------------------------------------
  if (cfg.whisper) {
    say();
    say(dim('Downloading the local dictation model (this can take a few minutes)…'));
    const res = spawnSync(process.execPath, [path.join(root, 'scripts', 'download-whisper-model.mjs')], {
      cwd: root, env: { ...process.env, ...(cfg.databaseUrl ? { DATABASE_URL: cfg.databaseUrl } : {}) }, encoding: 'utf8', stdio: 'inherit',
    });
    cfg.whisperDone = res.status === 0;
    if (!cfg.whisperDone) warn('Could not download the local dictation model. Browser dictation still works if your browser supports it; retry later with `npm run download-whisper-model`.');
  }

  finish(cfg, envFile);
  rl.close();
}

// ---------------------------------------------------------------------------
// Database step
// ---------------------------------------------------------------------------
async function setupDatabase(cfg, adminEmail) {
  const childEnv = { ...process.env, DATABASE_URL: cfg.databaseUrl };
  let devDb = null;

  if (cfg.dbMode === 'bundled') {
    if (await portOpen(cfg.dbPort)) {
      say(dim(`Using the database already running on port ${cfg.dbPort}.`));
    } else {
      say(dim(`Starting the built-in database on port ${cfg.dbPort}…`));
      devDb = spawn(process.execPath, [path.join(root, 'scripts', 'dev-db.mjs')], {
        cwd: root,
        env: { ...process.env, PGLITE_PORT: String(cfg.dbPort) },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      devDb.stderr.on('data', (d) => { stderr += d; });
      if (!(await waitForPort(cfg.dbPort, 45000, devDb))) {
        warn('The built-in database did not start.' + (stderr ? `\n${stderr.trim().split('\n').slice(-4).join('\n')}` : ''));
        if (devDb.exitCode === null) devDb.kill('SIGINT');
        return false;
      }
    }
  }

  let ok = true;
  try {
    say(dim('Applying migrations…'));
    const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
    const mig = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: root, env: childEnv, encoding: 'utf8' });
    if (mig.status !== 0) {
      warn('Migrations failed:\n' + ((mig.stderr || '') + (mig.stdout || '')).trim().split('\n').slice(-8).join('\n'));
      ok = false;
    } else {
      say('  Database tables are ready.');
    }

    if (ok && adminEmail) {
      const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const name = await ask('Administrator display name (optional)', '', { flagName: 'admin-name' });
      for (let attempt = 0; attempt < 3; attempt++) {
        let password = opt('admin-password') || process.env.RUNE_SETUP_ADMIN_PASSWORD || '';
        if (!password && !YES) {
          password = await askSecret('Password for the administrator (at least 10 characters)');
          const again = await askSecret('Type it again to confirm');
          if (password !== again) { say('  Those didn’t match. Try again.'); continue; }
        }
        if (!password) { warn('No administrator password was given, so no account was created. Run `npm run create-user -- --admin` later.'); break; }
        const args = [tsxCli, path.join(root, 'scripts', 'create-user.ts'), '--email', adminEmail, '--admin', '--if-missing'];
        if (name) args.push('--name', name);
        const res = spawnSync(process.execPath, args, { cwd: root, env: { ...childEnv, RUNE_CREATE_USER_PASSWORD: password }, encoding: 'utf8' });
        const outText = ((res.stdout || '') + (res.stderr || '')).trim();
        if (res.status === 0) { say(`  ${outText.split('\n').pop()}`); cfg.adminCreated = true; break; }
        warn(outText.split('\n').pop() || 'Could not create the administrator.');
        if (YES || opt('admin-password') || process.env.RUNE_SETUP_ADMIN_PASSWORD) { ok = false; break; }
      }
    }
  } finally {
    if (devDb && devDb.exitCode === null) {
      devDb.kill('SIGINT');
      await new Promise((resolve) => {
        devDb.once('exit', resolve);
        setTimeout(resolve, 10000);
      });
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Closing instructions
// ---------------------------------------------------------------------------
function finish(cfg, envFile) {
  const rel = path.relative(root, envFile) || envFile;
  say();
  say(bold('Next steps'));
  const base = cfg.baseUrl;

  if (cfg.target === 'local') {
    if (cfg.dbMode === 'bundled') {
      say('  1. npm run dev' + dim(`   (starts the local database on port ${cfg.dbPort} too)`));
    } else {
      say('  1. npm run dev');
    }
    say(`  Then open ${bold(base)}`);
    if (!cfg.dbDone) say(`  Before the first run: npm run db:migrate` + (cfg.adminEmail ? '  and  npm run create-user -- --admin' : ''));
  } else if (cfg.target === 'vps') {
    if (cfg.dbMode === 'compose') {
      say('  1. docker compose up -d --build     ' + dim('(starts Postgres + Rune, applies migrations)'));
      say(`  2. Put a TLS reverse proxy (Caddy, nginx, Traefik) in front and point ${bold(base)} at port ${new URL(base).port || '3000'}.`);
      say(`     ${dim('Make it forward the Host header, and keep RUNE_BASE_URL as configured.')}`);
    } else {
      say('  1. npm ci && npm run build && npm run db:migrate');
      say('  2. npm start      ' + dim('(with the variables from ' + rel + ' loaded)'));
    }
  } else {
    say(`  1. Open ${rel} and copy each KEY=value into your host's Environment Variables.`);
    if (cfg.target === 'vercel') {
      say('     Vercel: Project → Settings → Environment Variables (Production).');
      say('     Set the Build Command to: prisma migrate deploy && next build');
    } else if (cfg.target === 'netlify') {
      say('     Netlify: Site configuration → Environment variables.');
      say('     Set the Build Command to: prisma migrate deploy && next build');
    } else {
      say('     Use a build step that runs: prisma migrate deploy && next build   (or run `npm run db:migrate` yourself first).');
    }
    say(`  2. Deploy. Your site will be at ${bold(base)}`);
    if (cfg.s3Missing) warn('No file storage is configured. Uploads (notebook images, attachments) will fail on a host with no persistent disk. Add the S3_* variables (see DEPLOY.md).');
    if (cfg.target === 'vercel' || cfg.target === 'netlify') say(dim('  Note: notebook PDF export runs a headless browser and may hit this host’s function size/time limits on free plans.'));
  }

  if (cfg.adminViaRegistration) {
    say();
    say(`  ${bold('Administrator:')} once it is running, open ${base}/login, choose "Create an account" and register ${bold(cfg.adminEmail)}.`);
    say(dim('  That address is allowed to sign up even though sign-ups are ' + (cfg.signup === 'open' ? 'open' : 'restricted') + ', and it gets the admin console. Do this first, before anyone else knows the site exists.'));
  } else if (cfg.adminCreated) {
    say();
    say(`  ${bold('Sign in')} with ${bold(cfg.adminEmail)} and the password you just set.`);
  }

  say();
  if (cfg.smtp) {
    say(dim('Outbound email is configured. "Forgot password?" links will be emailed.'));
  } else {
    say(dim('Outbound email is off. "Forgot password?" still works - the reset link is written to the server console. Run `npm run setup` again to add SMTP.'));
  }
  if (cfg.whisperDone) {
    say(dim('Local dictation model is downloaded and ready to use offline.'));
  } else if (!cfg.whisper) {
    say(dim('Local dictation model was not downloaded. Browser dictation still works if supported; run `npm run download-whisper-model` any time to add offline dictation.'));
  }
  say();
}

main().catch((err) => {
  console.error('\nSetup failed:', err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});
