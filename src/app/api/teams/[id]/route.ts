import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';

const renameSchema = z.object({ name: z.string().trim().min(1).max(200) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const membership = await getMembership(id, session.userId);
  if (!membership) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  const team = await db.team.findUnique({ where: { id } });
  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  const memberships = await db.teamMembership.findMany({ where: { teamId: id } });
  const members = await Promise.all(
    memberships.map(async (m: any) => {
      const user = await db.user.findUnique({ where: { id: m.userId } });
      return {
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        name: user?.name || null,
        email: user?.email || '',
        avatarUrl: user?.avatarUrl || null
      };
    })
  );

  const subgroups = await db.teamSubgroupMember.findMany({ where: { teamId: id } });

  // Header stat strip - team-scoped, not gated by per-project visibility
  // (matches "Members"/"Team leaders" below, which are membership-wide too).
  const [activeProjects, blockedTasks] = await Promise.all([
    db.project.count({ where: { teamId: id, status: 'ACTIVE' } }),
    db.task.count({ where: { status: 'BLOCKED', project: { teamId: id } } })
  ]);
  const stats = {
    memberCount: members.length,
    activeProjects,
    blockedTasks,
    leaderCount: members.filter((m: { role: string }) => m.role === 'TEAM_LEADER').length
  };

  return NextResponse.json({ ...team, myRole: membership.role, members, subgroups, stats });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const membership = await getMembership(id, session.userId);
    if (!membership || membership.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the team owner can rename the team.' }, { status: 403 });
    }

    const parsed = renameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a team name.' }, { status: 400 });
    }
    const { name } = parsed.data;

    const updated = await db.team.update({ where: { id }, data: { name: name.trim() } });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating team:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const membership = await getMembership(id, session.userId);
    if (!membership || membership.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the team owner can delete the team.' }, { status: 403 });
    }

    // Team-scoped projects are detached (teamId -> null), not deleted - see
    // the team.delete mock in src/lib/db.ts. Deleting a team never destroys
    // project work, just its team association.
    await db.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting team:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
