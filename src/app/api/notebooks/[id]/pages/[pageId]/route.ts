import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(10_000_000).optional(),
  tags: z.array(z.string().max(200)).optional(),
});

/** Updates the notebook's single document - title, content and/or tags. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, pageId } = await params;
    const notebook = await db.notebook.findUnique({
      where: { id }
    });

    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }

    const page = await db.notebookPage.findUnique({ where: { id: pageId } });
    if (!page || page.notebookId !== id) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { title, content, tags } = parsed.data;

    // Includes author + attachments so the client's page object stays
    // complete after a save - without this, saving would silently drop
    // that metadata from local state until the next full notebook fetch.
    const updatedPage = await db.notebookPage.update({
      where: { id: pageId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(tags !== undefined ? { tags } : {})
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        attachments: true
      }
    });

    return NextResponse.json(updatedPage);
  } catch (err) {
    console.error('Error updating notebook page:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
