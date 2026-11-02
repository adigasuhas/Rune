import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runAllDueBackups } from '@/lib/backups';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * The daily backup job (vercel.json "crons"). Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set it refuses
 * to run, so nobody can trigger it from outside. Other hosts can call it
 * the same way from their own scheduler.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set.' }, { status: 503 });
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  }
  const result = await runAllDueBackups();
  return NextResponse.json(result);
}
