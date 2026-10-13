import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Flat list of every notebook page the caller owns, for "link this run to a
 * page" style pickers. Queried straight off NotebookPage with a projection
 * (no page content) so it stays cheap for a heavy notebook user.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  // db.notebook.findMany force-includes full page content; go direct instead.
  const notebooks = await db.notebook.findMany({ where: { userId: session.userId } });
  const notebookIds = (notebooks as any[]).map(n => n.id as string);
  const titleById = new Map((notebooks as any[]).map(n => [n.id as string, n.title as string]));
  if (notebookIds.length === 0) return NextResponse.json([]);

  const pages = await db.notebookPage.findMany({
    where: { notebookId: { in: notebookIds } },
    select: { id: true, title: true, notebookId: true }
  });

  const rows = (pages as any[]).map(p => ({
    id: p.id,
    title: p.title,
    notebookId: p.notebookId,
    notebookTitle: titleById.get(p.notebookId) || 'Notebook'
  }));
  rows.sort((a, b) => a.notebookTitle.localeCompare(b.notebookTitle));

  return NextResponse.json(rows);
}

export const dynamic = 'force-dynamic';
