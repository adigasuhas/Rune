import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook } from '@/lib/notebookAccess';

/** Fetches one snapshot's full content - for previewing it before restoring. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string; revisionId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId, revisionId } = await params;
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || !(await canViewNotebook(notebook, session.userId))) {
    return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
  }

  const revision = await db.notebookRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.pageId !== pageId) {
    return NextResponse.json({ error: 'Revision not found.' }, { status: 404 });
  }

  return NextResponse.json({ id: revision.id, content: revision.content, createdAt: revision.createdAt });
}

export const dynamic = 'force-dynamic';
