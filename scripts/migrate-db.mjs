/**
 * Copies every row from one Postgres database to another - e.g. from Prisma
 * Postgres to Neon - and proves the copy is exact.
 *
 *   npm run db:copy                # copy SOURCE -> TARGET, then verify
 *   npm run db:copy -- --verify    # only compare the two (safe to re-run any time)
 *
 * SOURCE_DATABASE_URL  the database to copy from (default: DATABASE_URL)
 * TARGET_DATABASE_URL  the database to copy into (default: NEON_DATABASE_URL)
 * Both are read from the environment, then .env.local, then .env.
 *
 * Safety:
 * - The source is only ever read, inside a READ ONLY transaction, so the
 *   copy is one consistent snapshot even if someone is using the app.
 * - The target's tables are created by `prisma migrate deploy` from this
 *   repo's migrations, so its structure is exactly what the app expects.
 * - The copy refuses to run unless every target table is empty, and it runs
 *   in a single transaction: it either lands completely or not at all.
 * - Afterwards each table is compared by row count and by a checksum of its
 *   full contents. Any difference fails the run.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.NEON_DATABASE_URL;
const verifyOnly = process.argv.includes('--verify');

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

if (!sourceUrl) fail('No source database. Set SOURCE_DATABASE_URL (or DATABASE_URL).');
if (!targetUrl) fail('No target database. Set TARGET_DATABASE_URL (or NEON_DATABASE_URL).');
const hostOf = (url) => new URL(url).host;
if (hostOf(sourceUrl) === hostOf(targetUrl) && new URL(sourceUrl).pathname === new URL(targetUrl).pathname) {
  fail('Source and target are the same database.');
}

// Every value comes back as Postgres's own text form and goes back in as
// text, so timestamps, JSON, enums and arrays round-trip byte for byte with
// no JavaScript conversion (and no time-zone shifting) in between.
const asText = { getTypeParser: () => (value) => value };
const connect = async (url) => {
  const client = new pg.Client({ connectionString: url, types: asText });
  await client.connect();
  return client;
};

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

async function tablesOf(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY table_name`);
  return rows.map((r) => r.table_name);
}

async function appliedMigrations(client) {
  const { rows } = await client.query(
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
  );
  return rows.map((r) => r.migration_name);
}

/** Row count plus an order-independent checksum of every row's contents. */
async function fingerprint(client, table) {
  const { rows } = await client.query(
    `SELECT count(*) AS n, coalesce(md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))), '') AS sum FROM public.${quote(table)} t`
  );
  return { rows: Number(rows[0].n), sum: rows[0].sum };
}

async function verify(source, target) {
  const tables = await tablesOf(source);
  let ok = true;
  console.log('\nTable                              Source   Target');
  for (const table of tables) {
    const [a, b] = await Promise.all([fingerprint(source, table), fingerprint(target, table)]);
    const same = a.rows === b.rows && a.sum === b.sum;
    if (!same) ok = false;
    console.log(`${same ? '✓' : '✗'} ${table.padEnd(32)} ${String(a.rows).padStart(6)}   ${String(b.rows).padStart(6)}${same || a.rows !== b.rows ? '' : '   (contents differ)'}`);
  }
  return ok;
}

async function copy(source, target) {
  const [sourceMigrations, targetMigrations] = await Promise.all([appliedMigrations(source), appliedMigrations(target)]);
  if (sourceMigrations.join() !== targetMigrations.join()) {
    const missing = targetMigrations.filter((m) => !sourceMigrations.includes(m));
    fail(
      `The source database is not on the same migrations as this repo` +
        (missing.length ? ` (it is missing ${missing.join(', ')}). Run \`npm run db:migrate\` against it first.` : '.')
    );
  }

  const tables = await tablesOf(source);
  for (const table of tables) {
    const { rows } = await target.query(`SELECT EXISTS (SELECT 1 FROM public.${quote(table)}) AS any`);
    if (rows[0].any === 't') fail(`Target table "${table}" already has data. Copy only into an empty database.`);
  }

  // Data: one consistent snapshot of the source, one transaction on the target.
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await target.query('BEGIN');
  try {
    // Foreign keys are dropped for the copy (so tables can load in any order,
    // self-references included) and re-created afterwards, which re-checks
    // every relationship. Managed hosts don't grant the superuser rights the
    // usual `session_replication_role` trick needs.
    const { rows: foreignKeys } = await target.query(`
      SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
    for (const fk of foreignKeys) await target.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${quote(fk.conname)}`);

    for (const table of tables) {
      const { rows, fields } = await source.query(`SELECT * FROM public.${quote(table)}`);
      if (rows.length) {
        const columns = fields.map((f) => f.name);
        const perBatch = Math.max(1, Math.floor(60000 / columns.length)); // Postgres allows 65535 parameters
        for (let i = 0; i < rows.length; i += perBatch) {
          const batch = rows.slice(i, i + perBatch);
          const values = [];
          const tuples = batch.map((row) => `(${columns.map((c) => `$${values.push(row[c])}`).join(', ')})`);
          await target.query(`INSERT INTO public.${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${tuples.join(', ')}`, values);
        }
      }
      console.log(`  copied ${String(rows.length).padStart(6)}  ${table}`);
    }

    for (const fk of foreignKeys) await target.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${quote(fk.conname)} ${fk.def}`);

    // Auto-increment columns continue after the copied rows, not from 1.
    const { rows: sequences } = await target.query(`
      SELECT s.seq::text AS seq, a.attrelid::regclass::text AS tbl, a.attname AS col
      FROM (SELECT d.objid::regclass AS seq, d.refobjid, d.refobjsubid FROM pg_depend d
            JOIN pg_class c ON c.oid = d.objid AND c.relkind = 'S' WHERE d.deptype IN ('a', 'i')) s
      JOIN pg_attribute a ON a.attrelid = s.refobjid AND a.attnum = s.refobjsubid`);
    for (const s of sequences) {
      await target.query(`SELECT setval('${s.seq}', coalesce((SELECT max(${quote(s.col)}) FROM ${s.tbl}), 0) + 1, false)`);
    }

    await target.query('COMMIT');
  } catch (err) {
    await target.query('ROLLBACK').catch(() => {});
    fail(`Copy failed and was rolled back; the target is unchanged. ${err.message}`);
  } finally {
    await source.query('ROLLBACK').catch(() => {});
  }
}

console.log(`Source: ${hostOf(sourceUrl)}\nTarget: ${hostOf(targetUrl)}`);
if (!verifyOnly) {
  // Structure first: the target gets this repo's migrations, exactly as a
  // production deploy would. (Run before we hold a connection of our own.)
  console.log('\nCreating tables on the target ...');
  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: targetUrl },
  });
  if (migrate.status !== 0) fail('`prisma migrate deploy` failed on the target.');
}

const source = await connect(sourceUrl);
const target = await connect(targetUrl);
try {
  if (!verifyOnly) await copy(source, target);
  const ok = await verify(source, target);
  if (!ok) {
    fail(
      verifyOnly
        ? 'The databases differ. If the app wrote to the source after the copy, recreate the target empty and run `npm run db:copy` again.'
        : 'The copy does not match the source.'
    );
  }
  console.log('\n✓ Every table matches. The source database was not modified.');
} finally {
  await Promise.all([source.end(), target.end()]);
}
