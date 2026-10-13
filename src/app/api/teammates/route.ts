import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Everyone the caller shares at least one team with, de-duplicated across
 * teams, excluding the caller. Used by the "waiting on" picker on a blocked
 * task and anywhere else that needs "people I actually work with" rather than
 * every account.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const myMemberships = await db.teamMembership.findMany({ where: { userId: session.userId } });
  const teamIds = myMemberships.map((m: any) => m.teamId as string);
  if (teamIds.length === 0) return NextResponse.json([]);

  const coMemberships = await db.teamMembership.findMany({ where: { teamId: { in: teamIds } } });
  const otherIds = Array.from(
    new Set(coMemberships.map((m: any) => m.userId as string).filter((uid: string) => uid !== session.userId))
  );
  if (otherIds.length === 0) return NextResponse.json([]);

  const people = await db.user.findMany({ where: { id: { in: otherIds } } });
  const result = people
    .filter((u: any) => u.status === 'ACTIVE' && !u.deletedAt)
    .map((u: any) => ({ id: u.id, name: u.name || null, email: u.email }))
    .sort((a: any, b: any) => (a.name || a.email).localeCompare(b.name || b.email));

  return NextResponse.json(result);
}

export const dynamic = 'force-dynamic';
