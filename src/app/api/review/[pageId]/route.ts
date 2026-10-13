import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook, canReviewNotebook } from '@/lib/notebookAccess';

/**
 * A single notebook page rendered for review - content + context + the
 * caller's role. Distinct from the notebook editor endpoints because a
 * reviewer is not the notebook owner (the editor is owner-only by design).
 */
export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { pageId } = await params;
  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: 'Page not found.' }, { status: 404 });

  const notebook = await db.notebook.findUnique({ where: { id: page.notebookId } });
  if (!notebook || !(await canViewNotebook(notebook, session.userId))) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }

  const project = notebook.projectId ? await db.project.findUnique({ where: { id: notebook.projectId } }) : null;
  const owner = await db.user.findUnique({ where: { id: notebook.userId } });
  const allPages = await db.notebookPage.findMany({ where: { notebookId: notebook.id } });

  const viewerRole = notebook.userId === session.userId
    ? 'owner'
    : (await canReviewNotebook(notebook, session.userId)) ? 'reviewer' : 'viewer';

  return NextResponse.json({
    page: {
      id: page.id,
      title: page.title,
      content: page.content,
      tags: page.tags,
      reviewStatus: page.reviewStatus,
      reviewRequestedAt: page.reviewRequestedAt
    },
    notebookId: notebook.id,
    notebookTitle: notebook.title,
    projectName: project?.name || null,
    projectId: project?.id || null,
    ownerName: owner?.name || owner?.email || 'Someone',
    viewerRole,
    // Sibling page ids/titles so cross-references in the rendered markdown resolve.
    siblingPages: allPages.map((p: any) => ({ id: p.id, title: p.title }))
  });
}

export const dynamic = 'force-dynamic';
