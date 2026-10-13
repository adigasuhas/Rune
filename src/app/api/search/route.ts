import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';

const PER_CATEGORY_LIMIT = 5;

/**
 * Global search (Cmd/Ctrl+K) across the object types a researcher actually
 * navigates to day-to-day: tasks, projects, notebook pages, runs. Scoped to
 * what the caller owns - not team-shared/collaborator-visible items, which
 * would need per-type permission checks (canViewProject etc.) this v1
 * deliberately keeps out to stay a contained, single-query-per-type search
 * rather than a full cross-permission index.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  // Generous - the command palette debounces at 200ms client-side, so even
  // fast typing is well under this; the limit exists for abuse, not normal use.
  const limited = enforceRateLimit(req, 'search', 60, 60_000, session.userId);
  if (limited) return limited;

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return NextResponse.json({ tasks: [], projects: [], notebookPages: [], runs: [] });
  }

  const [tasks, projects, notebookPages, runs] = await Promise.all([
    db.task.findMany({
      where: { userId: session.userId, name: { contains: q, mode: 'insensitive' } },
      take: PER_CATEGORY_LIMIT,
      orderBy: { updatedAt: 'desc' }
    }),
    db.project.findMany({
      where: { userId: session.userId, name: { contains: q, mode: 'insensitive' } },
      take: PER_CATEGORY_LIMIT,
      orderBy: { updatedAt: 'desc' }
    }),
    // A notebook is a single continuous document now (no more per-entry
    // titles worth matching on) - search its content too, and label the
    // result with the notebook's own title, which is what a writer
    // actually recognises it by.
    db.notebookPage.findMany({
      where: {
        notebook: { userId: session.userId },
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: PER_CATEGORY_LIMIT,
      orderBy: { updatedAt: 'desc' },
      include: { notebook: { select: { id: true, title: true } } }
    }),
    db.job.findMany({
      where: { userId: session.userId, name: { contains: q, mode: 'insensitive' } },
      take: PER_CATEGORY_LIMIT,
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  return NextResponse.json({
    tasks: tasks.map((t: any) => ({ id: t.id, name: t.name, date: t.date, status: t.status })),
    projects: projects.map((p: any) => ({ id: p.id, name: p.name, status: p.status })),
    notebookPages: notebookPages.map((p: any) => ({ id: p.id, title: p.notebook?.title || p.title, notebookId: p.notebookId, notebookTitle: p.notebook?.title || '' })),
    runs: runs.map((j: any) => ({ id: j.id, name: j.name, status: j.status }))
  });
}
export const dynamic = 'force-dynamic';
