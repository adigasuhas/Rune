/**
 * `npm run dev`: the app, plus the local database when it needs one.
 *
 * Rune's local Postgres (`npm run dev:db`, pglite) used to need its own
 * terminal. Forget it, or let a reboot or closed terminal stop it, and every
 * sign-in failed with "Rune can't reach its database". So this starts it
 * alongside the app when:
 *
 *   - DATABASE_URL (from the environment or .env) points at this machine, and
 *   - nothing is listening on that port yet.
 *
 * If something is already listening there (a dev:db you started yourself, or
 * your own Postgres) it's used as-is. A remote DATABASE_URL is left alone.
 * Set RUNE_DEV_DB=off to never start it. Ctrl+C stops both, the database
 * cleanly. Arguments are passed through to `next dev` (`npm run dev -- --port 3001`).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

function localPort(url) {
  try {
    const u = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname)) return null;
    return Number(u.port) || 5432;
  } catch {
    return null;
  }
}

const listening = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });

let db = null;
let app = null;
let stopping = false;

function stopDb() {
  if (!db || db.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    db.once('exit', resolve);
    db.kill('SIGINT'); // dev-db's own handler closes pglite cleanly
    setTimeout(() => { db.kill('SIGKILL'); resolve(); }, 10_000).unref();
  });
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  if (app && app.exitCode === null) app.kill('SIGTERM');
  await stopDb();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const url = databaseUrl();
const port = url ? localPort(url) : null;

if (port && process.env.RUNE_DEV_DB !== 'off' && !(await listening(port))) {
  console.log(`[dev] no database on 127.0.0.1:${port}, starting the local one (npm run dev:db)`);
  db = spawn(process.execPath, [path.join(root, 'scripts', 'dev-db.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = await new Promise((resolve) => {
    let seen = '';
    db.stdout.on('data', (chunk) => {
      const text = String(chunk);
      process.stdout.write(text.replace(/ Leave this running; start the app with `npm run dev`\./, ''));
      seen = (seen + text).slice(-200);
      if (seen.includes('[dev-db] ready')) resolve(true);
    });
    db.once('exit', () => resolve(false));
  });
  if (!ready) {
    console.error('[dev] the local database did not start (see the message above), so the app was not started.');
    process.exit(1);
  }
  db.once('exit', (code) => {
    if (stopping) return;
    console.error(`[dev] the local database stopped unexpectedly (exit ${code}); stopping the app.`);
    shutdown(1);
  });
}

app = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
app.once('exit', (code) => shutdown(code ?? 0));
