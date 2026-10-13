import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { saveUploadedImage, UploadValidationError, MAX_UPLOAD_BYTES } from '@/lib/storage';
import { enforceRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const limited = enforceRateLimit(req, 'upload', 30, 60_000, session.userId);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File is too large.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedImage(buffer, session.userId);

    return NextResponse.json({ url, name: file.name });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error('Error uploading file:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
