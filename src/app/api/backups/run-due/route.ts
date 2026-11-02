import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { runDueBackups } from '@/lib/backups';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Makes any of the caller's scheduled backups that are due. The app calls
 * this once per session, so schedules keep running on hosts with no daily
 * job (self-hosted, Docker). Cheap when nothing is due: two small queries.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const made = await runDueBackups(session.userId);
  return NextResponse.json({ made: made.length });
}
