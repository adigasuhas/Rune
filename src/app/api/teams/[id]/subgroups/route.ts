import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';

const assignSchema = z.object({
  teamLeaderId: z.string().min(1).max(200),
  memberId: z.string().min(1).max(200),
});

/** Assign a Member to a Team Leader's sub-group. Owner can assign anyone; a Team Leader can only add to their own sub-group. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const callerMembership = await getMembership(id, session.userId);
    if (!callerMembership) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const parsed = assignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'teamLeaderId and memberId are required.' }, { status: 400 });
    }
    const { teamLeaderId, memberId } = parsed.data;

    const isOwner = callerMembership.role === 'OWNER';
    const isSelfAssigningLeader = callerMembership.role === 'TEAM_LEADER' && callerMembership.userId === teamLeaderId;
    if (!isOwner && !isSelfAssigningLeader) {
      return NextResponse.json(
        { error: 'Only the owner or the team leader can add someone to a group.' },
        { status: 403 }
      );
    }

    const leaderMembership = await getMembership(id, teamLeaderId);
    const memberMembership = await getMembership(id, memberId);
    if (!leaderMembership || leaderMembership.role !== 'TEAM_LEADER') {
      return NextResponse.json({ error: 'teamLeaderId must be an existing team leader on this team.' }, { status: 400 });
    }
    if (!memberMembership || memberMembership.role !== 'MEMBER') {
      return NextResponse.json({ error: 'memberId must be an existing Member on this team.' }, { status: 400 });
    }

    const existing = await db.teamSubgroupMember.findMany({ where: { teamLeaderId, memberId } });
    if (existing.length > 0) {
      return NextResponse.json(existing[0]);
    }

    const created = await db.teamSubgroupMember.create({ data: { teamId: id, teamLeaderId, memberId } });
    return NextResponse.json(created);
  } catch (err) {
    console.error('Error assigning team sub-group member:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

/** Remove a Member from a Team Leader's sub-group. Same permission rule as adding. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const callerMembership = await getMembership(id, session.userId);
    if (!callerMembership) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const teamLeaderId = searchParams.get('teamLeaderId');
    const memberId = searchParams.get('memberId');
    if (!teamLeaderId || !memberId) {
      return NextResponse.json({ error: 'teamLeaderId and memberId query params are required.' }, { status: 400 });
    }

    const isOwner = callerMembership.role === 'OWNER';
    const isSelfManagingLeader = callerMembership.role === 'TEAM_LEADER' && callerMembership.userId === teamLeaderId;
    if (!isOwner && !isSelfManagingLeader) {
      return NextResponse.json(
        { error: 'Only the owner or the team leader can remove someone from a group.' },
        { status: 403 }
      );
    }

    const entries = await db.teamSubgroupMember.findMany({ where: { teamId: id, teamLeaderId, memberId } });
    for (const entry of entries) {
      await db.teamSubgroupMember.delete({ where: { id: entry.id } });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error removing team sub-group member:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
