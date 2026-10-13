import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  isPersonal: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const notebook = await db.notebook.findUnique({
      where: { id }
    });

    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }

    const page = await db.notebookPage.findUnique({
      where: { notebookId: id },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        attachments: true
      }
    });

    const project = notebook.projectId ? await db.project.findUnique({
      where: { id: notebook.projectId }
    }) : null;

    return NextResponse.json({
      ...notebook,
      page,
      project: project ? { id: project.id, name: project.name, color: project.color } : null
    });
  } catch (err) {
    console.error('Error fetching notebook:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const notebook = await db.notebook.findUnique({
      where: { id }
    });

    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { title, isPersonal, color, projectId } = parsed.data;

    // Linking to a project: only to one the caller owns, and only if that
    // project doesn't already have a notebook (projectId is @unique).
    let projectIdUpdate: { projectId: string | null } | Record<string, never> = {};
    if (projectId !== undefined) {
      if (projectId === null) {
        projectIdUpdate = { projectId: null };
      } else {
        const target = await db.project.findUnique({ where: { id: projectId } });
        if (!target || target.userId !== session.userId) {
          return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }
        projectIdUpdate = { projectId };
      }
    }

    const updatedNotebook = await db.notebook.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(isPersonal !== undefined ? { isPersonal } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...projectIdUpdate,
      }
    });

    return NextResponse.json(updatedNotebook);
  } catch (err) {
    console.error('Error updating notebook:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const notebook = await db.notebook.findUnique({
      where: { id }
    });

    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }

    await db.notebook.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting notebook:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
