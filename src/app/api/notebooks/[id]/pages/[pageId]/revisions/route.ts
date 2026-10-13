import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook } from '@/lib/notebookAccess';

async function loadContext(id: string, pageId: string, userId: string) {
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook) return { error: 'Notebook not found.' as const, status: 404 };
  if (!(await canViewNotebook(notebook, userId))) return { error: 'Notebook not found.' as const, status: 404 };
  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page || page.notebookId !== id) return { error: 'Page not found.' as const, status: 404 };
  return { notebook, page };
}

/** Lists this document's saved snapshots, newest first - the version history list. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const ctx = await loadContext(id, pageId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const revisions = await db.notebookRevision.findMany({ where: { pageId } });
  const authorIds = Array.from(new Set(revisions.map((r: any) => r.authorId).filter(Boolean) as string[]));
  const authors = authorIds.length ? await db.user.findMany({ where: { id: { in: authorIds } } }) : [];
  const nameById = new Map(authors.map((u: any) => [u.id as string, (u.name || u.email) as string]));

  const result = revisions
    .map((r: any) => ({
      id: r.id,
      contentLength: (r.content as string).length,
      authorId: r.authorId,
      authorName: r.authorId ? nameById.get(r.authorId) || 'Someone' : null,
      createdAt: r.createdAt
    }))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(result);
}

/** Snapshots the document's current (or supplied) content - called on manual save, not every autosave tick. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const ctx = await loadContext(id, pageId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const raw = await req.json().catch(() => ({}));
  const content = typeof raw.content === 'string' ? raw.content : ctx.page.content;

  const revision = await db.notebookRevision.create({
    data: { pageId, content, authorId: session.userId }
  });

  return NextResponse.json({ id: revision.id, createdAt: revision.createdAt }, { status: 201 });
}

export const dynamic = 'force-dynamic';
