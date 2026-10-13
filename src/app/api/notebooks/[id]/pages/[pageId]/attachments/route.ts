import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveUploadedFile, UploadValidationError } from '@/lib/storage';
import { enforceRateLimit } from '@/lib/rateLimit';

/** Uploads a file and attaches it to a notebook entry - a downloadable research artifact (PDF/data file/image), not an inline LaTeX figure. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const limited = enforceRateLimit(req, 'notebook-attachment', 30, 60_000, session.userId);
  if (limited) return limited;

  try {
    const { id, pageId } = await params;
    const notebook = await db.notebook.findUnique({ where: { id } });
    if (!notebook || notebook.userId !== session.userId) {
      return NextResponse.json({ error: 'Notebook not found.' }, { status: 404 });
    }
    const page = await db.notebookPage.findUnique({ where: { id: pageId } });
    if (!page || page.notebookId !== id) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, mime } = await saveUploadedFile(buffer, session.userId);

    const attachment = await db.notebookAttachment.create({
      data: {
        pageId,
        url,
        filename: file.name || 'attachment',
        mimeType: mime,
        size: buffer.length
      }
    });

    return NextResponse.json(attachment);
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error('Error uploading notebook attachment:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
