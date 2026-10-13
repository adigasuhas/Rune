import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { seedProjectNotebookSections } from '@/lib/notebookDefaults';
import { latexExcerpt } from '@/lib/notebookExcerpt';

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  projectId: z.string().max(200).nullable().optional(),
  isPersonal: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const notebooks = await db.notebook.findMany({
      where: { userId: session.userId },
      include: { page: { select: { updatedAt: true, tags: true, content: true } } },
    });

    const projects = await db.project.findMany({
      where: { userId: session.userId }
    });

    // Match projects with notebooks for easy metadata rendering
    const notebooksWithProject = notebooks.map((nb: any) => {
      const proj = nb.projectId ? projects.find((p: any) => p.id === nb.projectId) : null;
      // The library needs a glimpse of each document, never the whole
      // thing: a short plain-text excerpt (for covers and search), its tags
      // and when it was last edited.
      const { page, ...rest } = nb;
      return {
        ...rest,
        project: proj ? { id: proj.id, name: proj.name, color: proj.color } : null,
        summary: page ? { updatedAt: page.updatedAt, tags: page.tags, excerpt: latexExcerpt(page.content) } : null,
      };
    });

    return NextResponse.json(notebooksWithProject);
  } catch (err) {
    console.error('Error fetching notebooks:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a notebook title.' }, { status: 400 });
  }
  const { title, projectId, isPersonal, color } = parsed.data;

  try {

    // A project can hold more than one notebook (GoodNotes-style: project =
    // folder, each notebook inside it = its own document) - no dedupe check.
    let isFirstInProject = false;
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || project.userId !== session.userId) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
      const existing = await db.notebook.findMany({ where: { projectId } });
      isFirstInProject = existing.length === 0;
    }

    const notebook = await db.notebook.create({
      data: {
        title,
        projectId: projectId || null,
        isPersonal: isPersonal !== undefined ? isPersonal : false,
        color: color || null,
        userId: session.userId
      }
    });

    // Every notebook is a single continuous document. A project's first
    // notebook is seeded with the default lab-notebook skeleton; a second
    // (or later) notebook in the same project starts blank - it's usually
    // there for a distinct purpose the writer will name themselves, not a
    // repeat of the same six headings.
    if (projectId && isFirstInProject) {
      await seedProjectNotebookSections(notebook.id, session.userId);
    } else {
      await db.notebookPage.create({
        data: {
          notebookId: notebook.id,
          title: 'Notebook',
          content: '',
          tags: [],
          authorId: session.userId
        }
      });
    }

    return NextResponse.json(notebook);
  } catch (err) {
    console.error('Error creating notebook:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
