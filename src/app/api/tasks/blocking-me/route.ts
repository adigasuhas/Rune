import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Tasks that someone else has marked as BLOCKED and waiting on the caller.
 * This is the "you are the bottleneck" list - it powers the blocker's
 * dashboard "Needs attention" rail so a dependency lands on the one person
 * who can clear it (Theory of Constraints), not just on the owner's board
 * where it stalls silently.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const tasks = await db.task.findMany({
    where: { blockedOnUserId: session.userId, status: 'BLOCKED' }
  });

  const ownerIds = Array.from(new Set(tasks.map((t: any) => t.userId as string)));
  const owners = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } } })
    : [];
  const ownerById = new Map(owners.map((u: any) => [u.id as string, u]));

  const projectIds = Array.from(
    new Set(tasks.filter((t: any) => t.projectId).map((t: any) => t.projectId as string))
  );
  const projects = projectIds.length
    ? await db.project.findMany({ where: { id: { in: projectIds } } })
    : [];
  const projectById = new Map(projects.map((p: any) => [p.id as string, p]));

  const result = tasks
    .map((t: any) => {
      const owner = ownerById.get(t.userId);
      const project = t.projectId ? projectById.get(t.projectId) : null;
      return {
        id: t.id,
        name: t.name,
        blockedReason: t.blockedReason || null,
        ownerName: owner?.name || owner?.email || 'Someone',
        projectName: project?.name || null,
        projectId: t.projectId || null,
        since: t.updatedAt
      };
    })
    .sort((a: any, b: any) => new Date(a.since).getTime() - new Date(b.since).getTime());

  return NextResponse.json(result);
}

export const dynamic = 'force-dynamic';
