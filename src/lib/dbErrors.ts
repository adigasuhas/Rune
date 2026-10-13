import { NextResponse } from 'next/server';

/**
 * Turns "the database isn't usable" into a response a person can act on.
 *
 * Without this, a stopped `npm run dev:db`, a different Postgres squatting on
 * the configured port, or a schema that's behind its migrations all surfaced
 * on the sign-up screen as "Something went wrong" - indistinguishable from a
 * bug in the form. Prisma reports each case with a stable code.
 */
const UNREACHABLE = new Set(['P1000', 'P1001', 'P1002', 'P1003', 'P1010', 'P1011', 'P1017']);
const SCHEMA_BEHIND = new Set(['P2021', 'P2022']);

export type DbProblem = 'unreachable' | 'schema';

export function classifyDbError(err: unknown): DbProblem | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return null;
  if (UNREACHABLE.has(code)) return 'unreachable';
  if (SCHEMA_BEHIND.has(code)) return 'schema';
  return null;
}

/** A 503 for a database problem, or null if `err` is something else. Logs the operator-facing detail server-side. */
export function dbErrorResponse(err: unknown, context: string): NextResponse | null {
  const problem = classifyDbError(err);
  if (!problem) return null;
  console.error(
    `[${context}] database ${problem === 'schema' ? 'schema is behind its migrations - run `npm run db:migrate`' : 'is not reachable - check DATABASE_URL and that Postgres is running (`npm run dev:db` locally)'}:`,
    (err as Error).message
  );
  return NextResponse.json(
    {
      error: 'Rune can’t reach its database right now, so accounts can’t be created or opened. If you run this server, check that Postgres is up and migrated (see /api/health).',
      code: problem === 'schema' ? 'db_schema' : 'db_unavailable',
    },
    { status: 503 }
  );
}
