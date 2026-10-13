import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';

/**
 * Powers the hierarchy graph's drill-down: a person's team-scoped projects
 * plus their own task progress within them - used for both a Leader's own
 * summary and any Member's.
 *
 * Permission: the Owner can view anyone on the team; a Team Leader can view
 * themselves and only the Members in their own sub-group (never a peer
 * Leader's group, never someone outside it); a plain Member can only view
 * their own summary.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id: teamId, userId: targetUserId } = await params;
  const callerMembership = await getMembership(teamId, session.userId);
  if (!callerMembership) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  const targetMembership = await getMembership(teamId, targetUserId);
  if (!targetMembership) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  let allowed = callerMembership.role === 'OWNER' || session.userId === targetUserId;
  if (!allowed && callerMembership.role === 'TEAM_LEADER') {
    const subgroupEntries = await db.teamSubgroupMember.findMany({
      where: { teamId, teamLeaderId: session.userId, memberId: targetUserId }
    });
    allowed = subgroupEntries.length > 0;
  }
  if (!allowed) {
    return NextResponse.json({ error: 'You can only view your own sub-group\'s progress' }, { status: 403 });
  }

  const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  // Same "every team project they have access to" rule as project
  // visibility elsewhere: the team Owner sees all of them unconditionally,
  // anyone else only the ones they created or were added to as a collaborator.
  const teamProjects = await db.project.findMany({ where: { teamId } });
  const isTargetOwner = targetMembership.role === 'OWNER';
  const collaborations = await db.projectCollaborator.findMany({ where: { userId: targetUserId } });
  const collabProjectIds = new Set(collaborations.map((c: any) => c.projectId));
  const visibleProjects = teamProjects.filter(
    (p: any) => isTargetOwner || p.userId === targetUserId || collabProjectIds.has(p.id)
  );

  // task.userId is "whose task this is" (see Task.assignedById) - so this is
  // exactly the target's own workload, whether self-created or assigned to
  // them by someone else.
  const ownTasks = await db.task.findMany({ where: { userId: targetUserId } });
  const visibleProjectIds = new Set(visibleProjects.map((p: any) => p.id));
  const scopedTasks = ownTasks.filter((t: any) => t.projectId && visibleProjectIds.has(t.projectId));

  const projects = visibleProjects.map((p: any) => {
    const projectTasks = scopedTasks.filter((t: any) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      tasksTotal: projectTasks.length,
      tasksCompleted: projectTasks.filter((t: any) => t.status === 'COMPLETED').length,
      estimatedHours: projectTasks.reduce((sum: number, t: any) => sum + (t.estimatedTime || 0), 0),
      actualHours: projectTasks.reduce((sum: number, t: any) => sum + (t.actualTime || 0), 0)
    };
  });

  const taskStats = {
    total: scopedTasks.length,
    completed: scopedTasks.filter((t: any) => t.status === 'COMPLETED').length,
    inProgress: scopedTasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
    pending: scopedTasks.filter((t: any) => t.status === 'PENDING').length,
    blocked: scopedTasks.filter((t: any) => t.status === 'BLOCKED').length,
    totalEstimatedHours: scopedTasks.reduce((sum: number, t: any) => sum + (t.estimatedTime || 0), 0),
    totalActualHours: scopedTasks.reduce((sum: number, t: any) => sum + (t.actualTime || 0), 0)
  };

  return NextResponse.json({
    userId: targetUser.id,
    name: targetUser.name || null,
    email: targetUser.email,
    avatarUrl: targetUser.avatarUrl || null,
    role: targetMembership.role,
    projects,
    taskStats
  });
}

export const dynamic = 'force-dynamic';
