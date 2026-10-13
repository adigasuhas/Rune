import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; pageId: string; attachmentId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, pageId, attachmentId } = await params;
    const notebook = await db.notebook.findUnique({ where: { id } });
    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }
    const page = await db.notebookPage.findUnique({ where: { id: pageId } });
    if (!page || page.notebookId !== id) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }
    const attachment = await db.notebookAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.pageId !== pageId) {
      return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    }

    await db.notebookAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting notebook attachment:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
