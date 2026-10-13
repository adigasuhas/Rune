import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canEditProject } from '@/lib/teams';

/**
 * The reviewer's queue: notebook pages marked READY that live in a project
 * the caller can edit (i.e. they're a reviewer for it). Powers the PI's
 * "pages waiting on me" surface on the Lab dashboard. Batched so it stays
 * flat as the lab grows.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const notebooks = await db.notebook.findMany({ where: { projectId: { not: null } } });
  const relevant = (notebooks as any[]).filter(
    nb => nb.userId !== session.userId && nb.page?.reviewStatus === 'READY' &&
      // Sent to someone in particular: it's in their queue, not everyone's.
      (!nb.page.reviewRequestedFromId || nb.page.reviewRequestedFromId === session.userId)
  );
  if (relevant.length === 0) return NextResponse.json([]);

  const projectIds = Array.from(new Set(relevant.map(nb => nb.projectId as string)));
  const projects = await db.project.findMany({ where: { id: { in: projectIds } } });
  const projectById = new Map(projects.map((p: any) => [p.id as string, p]));

  const ownerIds = Array.from(new Set(relevant.map(nb => nb.userId as string)));
  const owners = await db.user.findMany({ where: { id: { in: ownerIds } } });
  const ownerName = new Map(owners.map((u: any) => [u.id as string, (u.name || u.email) as string]));

  const rows: any[] = [];
  const editable = new Map<string, boolean>();
  for (const nb of relevant) {
    const project = projectById.get(nb.projectId);
    if (!project) continue;
    if (!editable.has(project.id)) editable.set(project.id, await canEditProject(project, session.userId));
    if (!editable.get(project.id)) continue;

    const readyPages = nb.page ? [nb.page] : [];
    const pageIds = readyPages.map((p: any) => p.id as string);
    const comments = pageIds.length
      ? await db.notebookComment.findMany({ where: { pageId: { in: pageIds } } })
      : [];
    const openByPage = new Map<string, number>();
    for (const c of comments as any[]) {
      if (!c.resolved) openByPage.set(c.pageId, (openByPage.get(c.pageId) || 0) + 1);
    }

    for (const page of readyPages) {
      rows.push({
        pageId: page.id,
        pageTitle: page.title,
        notebookId: nb.id,
        notebookTitle: nb.title,
        projectId: project.id,
        projectName: project.name,
        ownerName: ownerName.get(nb.userId) || 'Someone',
        requestedAt: page.reviewRequestedAt,
        openComments: openByPage.get(page.id) || 0
      });
    }
  }

  rows.sort((a, b) => new Date(a.requestedAt || 0).getTime() - new Date(b.requestedAt || 0).getTime());
  return NextResponse.json(rows);
}

export const dynamic = 'force-dynamic';
