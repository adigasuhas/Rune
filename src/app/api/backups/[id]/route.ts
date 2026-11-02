import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canUseBackup } from '@/lib/backups/access';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET downloads the .zip; DELETE removes it. */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { id } = await params;
  const backup = await db.backup.findUnique({ where: { id } });
  if (!backup || !(await canUseBackup(backup, session.userId))) {
    return NextResponse.json({ error: 'Backup not found.' }, { status: 404 });
  }
  const bytes = new Uint8Array(backup.data);
  // The stored name is our own (letters, digits, dashes), but quote it safely anyway.
  const name = backup.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { id } = await params;
  const backup = await db.backup.findUnique({ where: { id }, select: { id: true, userId: true, projectId: true } });
  if (!backup || !(await canUseBackup(backup, session.userId))) {
    return NextResponse.json({ error: 'Backup not found.' }, { status: 404 });
  }
  await db.backup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
