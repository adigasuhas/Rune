import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership, isOwnerOrLeader } from '@/lib/teams';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, inviteId } = await params;
    const membership = await getMembership(id, session.userId);
    if (!membership || !isOwnerOrLeader(membership.role)) {
      return NextResponse.json({ error: 'Only the owner or a team leader can revoke invites.' }, { status: 403 });
    }

    const invite = await db.teamInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.teamId !== id) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }

    await db.teamInvite.update({ where: { id: inviteId }, data: { revoked: true } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error revoking team invite:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
