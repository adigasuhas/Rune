import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { seedProjectNotebookSections } from '@/lib/notebookDefaults';

/**
 * "Open Notebook" from a project. A project can hold more than one notebook
 * now (GoodNotes-style folder), so this isn't a single create-if-missing
 * lookup anymore:
 *  - zero notebooks  -> creates + seeds one, returns { mode: 'notebook' }
 *  - exactly one     -> returns it directly, { mode: 'notebook' } (fast
 *                       path - no need to make the writer pick from a list
 *                       of one)
 *  - two or more     -> returns { mode: 'folder' } so the caller opens the
 *                       library with this project's folder expanded instead
 *                       of guessing which one the writer wants.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.userId) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const existing = await db.notebook.findMany({ where: { projectId } });

    if (existing.length === 1) {
      return NextResponse.json({ mode: 'notebook', notebook: existing[0] });
    }
    if (existing.length > 1) {
      return NextResponse.json({ mode: 'folder', projectId });
    }

    const notebook = await db.notebook.create({
      data: {
        title: `${project.name} Notebook`,
        projectId,
        isPersonal: false,
        userId: session.userId
      }
    });

    await seedProjectNotebookSections(notebook.id, session.userId);

    return NextResponse.json({ mode: 'notebook', notebook });
  } catch (err) {
    console.error('Error opening project notebook:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
