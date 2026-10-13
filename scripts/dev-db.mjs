/**
 * Local development database.
 *
 * Runs a real PostgreSQL (via pglite, Postgres compiled to WASM) on
 * 127.0.0.1, speaking the Postgres wire protocol, so the app and Prisma talk
 * to genuine Postgres with zero external services to install. Data persists
 * under `prisma/pglite-data/`.
 *
 *   npm run dev           # starts this automatically when it isn't running
 *   npm run dev:db        # or run it on its own (keep it running in a terminal)
 *
 * The port comes from PGLITE_PORT, else from DATABASE_URL in .env, else 5432 -
 * so the database and the app can't silently disagree about where it is.
 * Pending migrations are applied on start, so a `git pull` that adds a column
 * doesn't turn into "sign-up is broken".
 *
 * Production uses a normal managed Postgres - this script is dev-only.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.PGLITE_DATA_DIR || path.join(root, 'prisma', 'pglite-data');

function databaseUrlFromEnvFile() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

const configuredUrl = databaseUrlFromEnvFile();
let urlPort;
try { urlPort = configuredUrl ? Number(new URL(configuredUrl).port) || 5432 : undefined; } catch { /* malformed - ignore */ }
const port = Number(process.env.PGLITE_PORT || urlPort || 5432);
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

function fail(lines) {
  console.error('\n[dev-db] ' + lines.join('\n[dev-db] ') + '\n');
  process.exit(1);
}

// Another Postgres (or anything) already on the port means the app would
// connect to *that* - and every sign-in/sign-up would fail with an auth error.
const portBusy = await new Promise((resolve) => {
  const probe = net.createServer().once('error', () => resolve(true)).once('listening', () => probe.close(() => resolve(false)));
  probe.listen(port, '127.0.0.1');
});
if (portBusy) {
  fail([
    `Port ${port} is already in use by another process, so Rune's database can't start there.`,
    `If it's another project's Postgres, Rune would be talking to the wrong database.`,
    `Fix: pick a free port for both sides, e.g. set in .env`,
    `       DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres`,
    `     and run \`npm run dev:db\` again (it reads the port from DATABASE_URL).`,
  ]);
}

let db;
try {
  db = await PGlite.create({ dataDir });
  await db.exec(`SELECT 1`);
} catch (err) {
  fail([
    `Couldn't open the database in ${path.relative(root, dataDir)}: ${err?.message || err}`,
    `This usually means the data was damaged by an unclean shutdown (e.g. the terminal was killed mid-write).`,
    `pglite can't repair it in place. To start fresh, move it aside (keeps a copy) and run again:`,
    `  mv ${path.relative(root, dataDir)} ${path.relative(root, dataDir)}.broken-$(date +%Y%m%d)`,
    `If you have a Rune backup file, restore it afterwards from Settings › Data and export › Restore backup.`,
  ]);
}

// pglite defaults to a single connection; the app's pg Pool wants several.
// Queries are still serialised at the query level inside pglite.
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 40 });
await server.start();

console.log(`[dev-db] postgres (pglite) on 127.0.0.1:${port}, data at ${path.relative(root, dataDir)}`);
if (configuredUrl && !configuredUrl.includes(`:${port}/`)) {
  console.warn(`[dev-db] warning: .env DATABASE_URL points elsewhere (${configuredUrl.replace(/:[^:@/]+@/, ':***@')}). Use ${url}`);
}

if (process.env.PGLITE_SKIP_MIGRATE !== '1') {
  // Must be async: the database server runs in this same process, so a
  // blocking spawnSync would stop it accepting the very connection
  // `prisma migrate` is trying to make (P1001).
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  const mig = await new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (status) => resolve({ status, out }));
    child.on('error', (err) => resolve({ status: 1, out: String(err) }));
  });
  if (mig.status === 0) {
    console.log(`[dev-db] schema up to date${/No pending migrations/.test(mig.out) ? '' : ' (applied pending migrations)'}`);
  } else {
    console.error(`[dev-db] couldn't apply migrations - the app may fail until you run \`npm run db:migrate\`:\n${mig.out.trim().split('\n').slice(-6).join('\n')}`);
  }
}

console.log(`[dev-db] ready. Leave this running; start the app with \`npm run dev\`.`);

let closing = false;
const shutdown = async () => {
  // Ctrl+C under `npm run dev` reaches this twice (the terminal and the
  // parent both send SIGINT); closing pglite twice would throw.
  if (closing) return;
  closing = true;
  console.log('\n[dev-db] shutting down');
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
