import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Liveness + readiness probe for load balancers and uptime monitors.
 * Public (no auth) - see src/proxy.ts. Returns 200 only when the process is
 * up AND the database answers a trivial query.
 */
export async function GET() {
  const started = Date.now();
  let database: 'ok' | 'error' = 'ok';
  try {
    // Cheap round-trip that works on both the Prisma driver adapter and the
    // JSON-fallback adapter (indexed lookup on Postgres, in-memory on JSON).
    await db.user.findMany({ where: { id: '__healthcheck__' } });
  } catch {
    database = 'error';
  }

  const body = {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    driver: 'postgres', // DATABASE_URL is a hard startup requirement (src/lib/env.ts) - there is no other driver.
    version: process.env.npm_package_version || '0.1.0',
    commit: process.env.RUNE_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    uptimeSeconds: Math.round(process.uptime()),
    checkMs: Date.now() - started,
  };
  return NextResponse.json(body, { status: database === 'ok' ? 200 : 503 });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
