import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';

/** Preview an invite before committing to redeem it (team name, granted role, already-a-member state). */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { code } = await params;
  const invite = await db.teamInvite.findUnique({ where: { code } });
  if (!invite || invite.revoked || (invite.expiresAt && new Date(invite.expiresAt) < new Date())) {
    return NextResponse.json({ error: 'This invite link isn’t valid or has expired.' }, { status: 404 });
  }

  const team = await db.team.findUnique({ where: { id: invite.teamId } });
  if (!team) {
    return NextResponse.json({ error: 'This invite link isn’t valid or has expired.' }, { status: 404 });
  }

  const existingMembership = await getMembership(invite.teamId, session.userId);

  return NextResponse.json({
    teamName: team.name,
    role: invite.role,
    alreadyMember: Boolean(existingMembership)
  });
}

export const dynamic = 'force-dynamic';
