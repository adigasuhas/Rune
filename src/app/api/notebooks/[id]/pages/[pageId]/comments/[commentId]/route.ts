import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook } from '@/lib/notebookAccess';

const patchSchema = z.object({ resolved: z.boolean().optional() });

async function loadComment(id: string, pageId: string, commentId: string, userId: string) {
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || !(await canViewNotebook(notebook, userId))) return { error: 'Not found' as const };
  const comment = await db.notebookComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.pageId !== pageId) return { error: 'Not found' as const };
  return { notebook, comment };
}

/** Resolve / reopen a comment thread entry. Author or notebook owner only. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string; commentId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId, commentId } = await params;
  const ctx = await loadComment(id, pageId, commentId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 404 });

  const isOwnerOrAuthor = ctx.comment.authorId === session.userId || ctx.notebook.userId === session.userId;
  if (!isOwnerOrAuthor) return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  const resolved = parsed.success ? parsed.data.resolved : undefined;
  const updated = await db.notebookComment.update({
    where: { id: commentId },
    data: { resolved: resolved === true }
  });
  return NextResponse.json({ id: updated.id, resolved: updated.resolved });
}

/** Delete a comment. Author or notebook owner only. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string; commentId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId, commentId } = await params;
  const ctx = await loadComment(id, pageId, commentId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 404 });

  const isOwnerOrAuthor = ctx.comment.authorId === session.userId || ctx.notebook.userId === session.userId;
  if (!isOwnerOrAuthor) return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 });

  await db.notebookComment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}

export const dynamic = 'force-dynamic';
