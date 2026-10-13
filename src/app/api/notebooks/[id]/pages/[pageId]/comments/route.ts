import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook } from '@/lib/notebookAccess';
import { createNotification } from '@/lib/notify';
import { sanitizePlainText } from '@/lib/sanitizeHtml';

async function loadContext(id: string, pageId: string, userId: string) {
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook) return { error: 'Notebook not found.' as const, status: 404 };
  if (!(await canViewNotebook(notebook, userId))) return { error: 'Notebook not found.' as const, status: 404 };
  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page || page.notebookId !== id) return { error: 'Page not found.' as const, status: 404 };
  return { notebook, page };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const ctx = await loadContext(id, pageId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const comments = await db.notebookComment.findMany({ where: { pageId } });
  const authorIds = Array.from(new Set(comments.map((c: any) => c.authorId as string)));
  const authors = authorIds.length ? await db.user.findMany({ where: { id: { in: authorIds } } }) : [];
  const nameById = new Map(authors.map((u: any) => [u.id as string, (u.name || u.email) as string]));
  const avatarById = new Map(authors.map((u: any) => [u.id as string, (u.avatarUrl ?? null) as string | null]));

  const result = comments
    .map((c: any) => ({
      id: c.id,
      body: c.body,
      anchorQuote: c.anchorQuote || null,
      resolved: c.resolved,
      authorId: c.authorId,
      authorName: nameById.get(c.authorId) || 'Someone',
      authorAvatarUrl: avatarById.get(c.authorId) ?? null,
      isMine: c.authorId === session.userId,
      createdAt: c.createdAt
    }))
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const ctx = await loadContext(id, pageId, session.userId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { notebook, page } = ctx;

  const raw = await req.json();
  const body = sanitizePlainText(String(raw.body ?? '')).trim().slice(0, 4000);
  if (!body) return NextResponse.json({ error: 'Enter a comment.' }, { status: 400 });
  const anchorQuote = raw.anchorQuote
    ? sanitizePlainText(String(raw.anchorQuote)).trim().slice(0, 500) || null
    : null;

  const comment = await db.notebookComment.create({
    data: { pageId, authorId: session.userId, body, anchorQuote }
  });

  // Notify the notebook owner (if someone else commented) and, if the owner
  // commented, whoever else is in the thread.
  const actor = await db.user.findUnique({ where: { id: session.userId } });
  const actorName = actor?.name || actor?.email || 'Someone';
  const recipients = new Set<string>();
  if (notebook.userId !== session.userId) recipients.add(notebook.userId);
  const priorAuthors = await db.notebookComment.findMany({ where: { pageId } });
  for (const c of priorAuthors as any[]) {
    if (c.authorId !== session.userId) recipients.add(c.authorId as string);
  }
  for (const uid of recipients) {
    await createNotification({
      userId: uid,
      type: 'NOTEBOOK_COMMENT',
      title: `${actorName} commented`,
      body: `On “${page.title}”: ${body.slice(0, 120)}${body.length > 120 ? '…' : ''}`,
      sourceType: 'Notebook',
      sourceId: pageId,
      dedupeKey: `notebook:${pageId}:comment:${comment.id}`
    });
  }

  return NextResponse.json({ id: comment.id, body, anchorQuote, resolved: false, authorId: session.userId, authorName: actorName, authorAvatarUrl: actor?.avatarUrl ?? null, isMine: true, createdAt: comment.createdAt }, { status: 201 });
}

export const dynamic = 'force-dynamic';
