import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * A read-out to seed a lab / group standup: for each person the caller leads
 * (team owner -> whole team; team leader -> their sub-group), what they've
 * shipped recently, what's in flight, and what they're blocked on.
 *
 * Deliberately NOT a productivity scoreboard - no scores, no hours, no
 * ranking. It leads with recent *done* work (progress principle) and surfaces
 * blocks so the group can unstick each other (Ostrom - shared awareness, not
 * top-down monitoring). Only leaders see it; a regular member gets nothing.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const myMemberships = await db.teamMembership.findMany({ where: { userId: session.userId } });
  const leadTeamIds = myMemberships
    .filter((m: any) => m.role === 'OWNER' || m.role === 'TEAM_LEADER')
    .map((m: any) => m.teamId as string);
  if (leadTeamIds.length === 0) return NextResponse.json({ teams: [] });

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;

  const out: any[] = [];
  for (const teamId of leadTeamIds) {
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team) continue;
    const myRole = (myMemberships.find((m: any) => m.teamId === teamId) as any)?.role;

    // Who this caller can report on for this team.
    let memberIds: string[];
    if (myRole === 'OWNER') {
      const all = await db.teamMembership.findMany({ where: { teamId } });
      memberIds = all.map((m: any) => m.userId as string).filter((id: string) => id !== session.userId);
    } else {
      const subgroup = await db.teamSubgroupMember.findMany({ where: { teamId, teamLeaderId: session.userId } });
      memberIds = subgroup.map((s: any) => s.memberId as string);
    }
    if (memberIds.length === 0) continue;

    const [people, tasks] = await Promise.all([
      db.user.findMany({ where: { id: { in: memberIds } } }),
      db.task.findMany({ where: { userId: { in: memberIds } } })
    ]);
    const tasksByUser = new Map<string, any[]>();
    for (const t of tasks as any[]) {
      if (!tasksByUser.has(t.userId)) tasksByUser.set(t.userId, []);
      tasksByUser.get(t.userId)!.push(t);
    }

    const rows = (people as any[])
      .map(u => {
        const ts = tasksByUser.get(u.id) || [];
        const doneRecently = ts.filter(t => t.status === 'COMPLETED' && new Date(t.updatedAt).getTime() >= weekAgo);
        const inProgress = ts.filter(t => t.status === 'IN_PROGRESS');
        const blocked = ts.filter(t => t.status === 'BLOCKED');
        return {
          userId: u.id,
          name: u.name || u.email,
          doneCount: doneRecently.length,
          done: doneRecently.slice(0, 5).map(t => t.name),
          inProgress: inProgress.slice(0, 5).map(t => t.name),
          blocked: blocked.slice(0, 5).map(t => ({ name: t.name, reason: t.blockedReason || null }))
        };
      })
      .filter(r => r.doneCount > 0 || r.inProgress.length > 0 || r.blocked.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (rows.length > 0) out.push({ teamId, teamName: team.name, people: rows });
  }

  return NextResponse.json({ teams: out });
}

export const dynamic = 'force-dynamic';
