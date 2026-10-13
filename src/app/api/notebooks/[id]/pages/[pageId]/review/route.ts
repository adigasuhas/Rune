import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewNotebook, canReviewNotebook, getNotebookReviewerIds, listNotebookReviewers } from '@/lib/notebookAccess';
import { createNotification } from '@/lib/notify';

const reviewSchema = z.object({ status: z.string().max(50), reviewerId: z.string().max(100).optional() });

/**
 * Move a page through the review workflow:
 *  - READY    : the notebook owner asks one chosen reviewer (`reviewerId`,
 *               who must be able to review this notebook) and notifies them
 *  - NONE     : the owner withdraws the request
 *  - REVIEWED : a reviewer signs off (notifies the owner)
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || !(await canViewNotebook(notebook, session.userId))) {
    return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
  }
  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page || page.notebookId !== id) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }

  const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'status must be READY, REVIEWED or NONE.' }, { status: 400 });
  }
  const { status, reviewerId } = parsed.data;
  const isOwner = notebook.userId === session.userId;
  const isReviewer = await canReviewNotebook(notebook, session.userId);

  if (status === 'READY' || status === 'NONE') {
    if (!isOwner) return NextResponse.json({ error: 'Only the notebook owner can request review.' }, { status: 403 });
    if (status === 'READY' && !notebook.projectId) {
      return NextResponse.json({ error: 'Link this notebook to a team project before requesting review.' }, { status: 400 });
    }
    // The picker only offers eligible people, but the server is what decides.
    if (status === 'READY' && (!reviewerId || !(await getNotebookReviewerIds(notebook)).includes(reviewerId))) {
      return NextResponse.json({ error: 'Choose a reviewer from this project’s team.' }, { status: 400 });
    }
  } else if (status === 'REVIEWED') {
    if (!isReviewer) return NextResponse.json({ error: 'Only a reviewer can mark a document reviewed.' }, { status: 403 });
  } else {
    return NextResponse.json({ error: 'status must be READY, REVIEWED or NONE.' }, { status: 400 });
  }

  const updated = await db.notebookPage.update({
    where: { id: pageId },
    data: {
      reviewStatus: status,
      reviewRequestedAt: status === 'READY' ? new Date() : page.reviewRequestedAt,
      ...(status === 'READY' ? { reviewRequestedFromId: reviewerId } : status === 'NONE' ? { reviewRequestedFromId: null } : {})
    }
  });

  if (status === 'READY') {
    const owner = await db.user.findUnique({ where: { id: session.userId } });
    const ownerName = owner?.name || owner?.email || 'A teammate';
    await createNotification({
      userId: reviewerId!,
      type: 'NOTEBOOK_REVIEW_REQUESTED',
      title: `${ownerName} asked you for a review`,
      body: `“${page.title}” is ready for review.`,
      sourceType: 'Notebook',
      sourceId: pageId,
      dedupeKey: `notebook:${pageId}:review-request:${reviewerId}`
    });
  } else if (status === 'REVIEWED') {
    const reviewer = await db.user.findUnique({ where: { id: session.userId } });
    const reviewerName = reviewer?.name || reviewer?.email || 'A reviewer';
    await createNotification({
      userId: notebook.userId,
      type: 'NOTEBOOK_REVIEW_REQUESTED',
      title: `${reviewerName} reviewed your page`,
      body: `“${page.title}” has been marked reviewed.`,
      sourceType: 'Notebook',
      sourceId: pageId,
      dedupeKey: `notebook:${pageId}:reviewed:${Date.now()}`
    });
  }

  return NextResponse.json({
    id: updated.id,
    reviewStatus: updated.reviewStatus,
    reviewRequestedAt: updated.reviewRequestedAt,
    reviewRequestedFromId: updated.reviewRequestedFromId ?? null
  });
}

/**
 * For the owner's "Ask for review" picker: who can review this notebook
 * right now, and who the open request (if any) went to - flagged when that
 * person has since lost access, so the owner can send it to someone else.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const { id, pageId } = await params;
  const notebook = await db.notebook.findUnique({ where: { id } });
  if (!notebook || notebook.userId !== session.userId) {
    return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
  }
  const page = await db.notebookPage.findUnique({ where: { id: pageId } });
  if (!page || page.notebookId !== id) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }

  const reviewers = await listNotebookReviewers(notebook);
  let requestedFrom: { id: string; name: string; eligible: boolean } | null = null;
  if (page.reviewRequestedFromId) {
    const u = await db.user.findUnique({ where: { id: page.reviewRequestedFromId } });
    requestedFrom = {
      id: page.reviewRequestedFromId,
      name: u?.name || u?.email || 'A former teammate',
      eligible: reviewers.some((r) => r.id === page.reviewRequestedFromId),
    };
  }
  return NextResponse.json({ reviewStatus: page.reviewStatus, requestedFrom, reviewers });
}

export const dynamic = 'force-dynamic';
