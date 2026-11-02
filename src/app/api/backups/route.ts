import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';
import { isSmtpConfigured } from '@/lib/mailer';
import { BACKUP_META_SELECT, BackupTooLargeError, createBackup, getBackupPolicy } from '@/lib/backups';
import { projectForBackups } from '@/lib/backups/access';

// Building a backup renders every notebook; give it room.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET  /api/backups              the account's backups and backup policy
 * GET  /api/backups?projectId=…  that project's backups and schedule
 * POST /api/backups              { projectId? } - make one now
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (projectId) {
    const project = await projectForBackups(projectId, session.userId);
    if (!project) return NextResponse.json({ error: 'You can’t manage backups for this project.' }, { status: 403 });
    const backups = await db.backup.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: BACKUP_META_SELECT });
    return NextResponse.json({ backups, frequency: project.backupFrequency, lastBackupAt: project.lastBackupAt });
  }

  const [backups, policy] = await Promise.all([
    db.backup.findMany({ where: { userId: session.userId, projectId: null }, orderBy: { createdAt: 'desc' }, select: BACKUP_META_SELECT }),
    getBackupPolicy(session.userId),
  ]);
  return NextResponse.json({ backups, policy, emailAvailable: isSmtpConfigured() });
}

const createSchema = z.object({ projectId: z.string().min(1).max(100).nullish() }).strict();

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const limited = enforceRateLimit(req, 'backup-create', 10, 10 * 60 * 1000, session.userId);
  if (limited) return limited;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Some fields are missing or invalid.' }, { status: 400 });
  const projectId = parsed.data.projectId ?? null;
  if (projectId && !(await projectForBackups(projectId, session.userId))) {
    return NextResponse.json({ error: 'You can’t back up this project.' }, { status: 403 });
  }

  try {
    const backup = await createBackup({ userId: session.userId, projectId, trigger: 'MANUAL' });
    return NextResponse.json(backup, { status: 201 });
  } catch (err) {
    if (err instanceof BackupTooLargeError) return NextResponse.json({ error: err.message }, { status: 413 });
    console.error('[backups] manual backup failed:', err);
    return NextResponse.json({ error: 'The backup couldn’t be made. Try again.' }, { status: 500 });
  }
}
