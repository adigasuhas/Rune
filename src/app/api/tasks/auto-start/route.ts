import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { autoStartDueTasks } from '@/lib/taskAutoStart';

export const dynamic = 'force-dynamic';

/**
 * Moves the caller's To do tasks whose scheduled time has begun to In
 * progress (once per slot - see src/lib/taskAutoStart.ts). The open app
 * calls it when a slot starts and whenever it comes back into view.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  try {
    return NextResponse.json({ started: await autoStartDueTasks(session.userId) });
  } catch (err) {
    console.error('Auto-starting tasks failed:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
