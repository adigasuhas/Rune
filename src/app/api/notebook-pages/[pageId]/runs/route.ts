import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Runs (experiments / compute jobs) linked to a given notebook page, so the
 * write-up can show the run that produced it - status, timing, instrument -
 * without leaving the notebook.
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
  if (!notebook || notebook.userId !== session.userId) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }

  const runs = await db.job.findMany({ where: { notebookPageId: pageId, userId: session.userId } });
  const instrumentIds = Array.from(
    new Set(runs.filter((r: any) => r.instrumentId).map((r: any) => r.instrumentId as string))
  );
  const instruments = instrumentIds.length
    ? await db.instrument.findMany({ where: { id: { in: instrumentIds } } })
    : [];
  const instrumentById = new Map(instruments.map((i: any) => [i.id as string, i.name as string]));

  const result = runs
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      category: r.category,
      instrumentName: r.instrumentId ? instrumentById.get(r.instrumentId) || null : null,
      submitTime: r.submitTime,
      actualEndTime: r.actualEndTime || null
    }))
    .sort((a: any, b: any) => new Date(b.submitTime).getTime() - new Date(a.submitTime).getTime());

  return NextResponse.json(result);
}

export const dynamic = 'force-dynamic';
