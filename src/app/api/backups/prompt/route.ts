import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isBackupDue, type BackupFrequency } from '@/lib/backups/format';

export const dynamic = 'force-dynamic';

/**
 * Whether to ask the caller to download their newest account backup before
 * they carry on. With automatic backups on (daily, weekly or monthly), the
 * first visit of each new period asks once; downloading any account backup
 * (here or in Settings → Backups) answers it until the next period.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const [setting, user] = await Promise.all([
    db.setting.findUnique({ where: { userId: session.userId }, select: { backupFrequency: true, lastBackupDownloadAt: true } }),
    db.user.findUnique({ where: { id: session.userId }, select: { timezone: true } }),
  ]);
  const frequency = (setting?.backupFrequency ?? 'OFF') as BackupFrequency;
  const tz = user?.timezone || 'UTC';
  if (!isBackupDue(frequency, setting?.lastBackupDownloadAt ?? null, new Date(), tz)) {
    return NextResponse.json({ due: false });
  }
  const backup = await db.backup.findFirst({
    where: { userId: session.userId, projectId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, sizeBytes: true, createdAt: true },
  });
  if (!backup) return NextResponse.json({ due: false });
  return NextResponse.json({ due: true, frequency, backup });
}
