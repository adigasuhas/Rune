import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Restores a prior snapshot as the document's current content. Snapshots the
 * pre-restore content first, so restoring is itself undoable from the same
 * history list rather than a one-way trip.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string; revisionId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId, revisionId } = await params;
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || notebook.userId !== session.userId) {
    return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
  }

  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page || page.notebookId !== id) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }

  const revision = await db.notebookRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.pageId !== pageId) {
    return NextResponse.json({ error: 'Revision not found.' }, { status: 404 });
  }

  await db.notebookRevision.create({
    data: { pageId, content: page.content, authorId: session.userId }
  });

  const updated = await db.notebookPage.update({
    where: { id: pageId },
    data: { content: revision.content },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      attachments: true
    }
  });

  return NextResponse.json(updated);
}

export const dynamic = 'force-dynamic';
