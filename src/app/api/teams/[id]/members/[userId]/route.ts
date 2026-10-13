import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership, removeMemberAndCleanup } from '@/lib/teams';

const roleSchema = z.object({ role: z.string().max(50) });

/** Promote/demote a member. Owner-only, and the owner role itself can't be granted here - see /transfer-ownership. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, userId } = await params;
    const callerMembership = await getMembership(id, session.userId);
    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the team owner can change member roles.' }, { status: 403 });
    }

    const targetMembership = await getMembership(id, userId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }
    if (targetMembership.role === 'OWNER') {
      return NextResponse.json({ error: 'To change the owner, transfer ownership instead.' }, { status: 400 });
    }

    const parsed = roleSchema.safeParse(await req.json().catch(() => null));
    const role = parsed.success ? parsed.data.role : null;
    if (role !== 'TEAM_LEADER' && role !== 'MEMBER') {
      return NextResponse.json({ error: 'role must be TEAM_LEADER or MEMBER.' }, { status: 400 });
    }

    const updated = await db.teamMembership.update({ where: { id: targetMembership.id }, data: { role } });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating team member role:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

/** Remove someone from the team entirely. Owner-only - a Team Leader can unassign someone from their own subgroup (see /subgroups) but can't remove team membership outright. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, userId } = await params;
    const callerMembership = await getMembership(id, session.userId);
    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the team owner can remove members.' }, { status: 403 });
    }

    const targetMembership = await getMembership(id, userId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }
    if (targetMembership.role === 'OWNER') {
      return NextResponse.json({ error: 'The owner can’t be removed. Transfer ownership first.' }, { status: 400 });
    }

    await removeMemberAndCleanup(id, userId, targetMembership.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error removing team member:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
