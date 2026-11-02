import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getBackupPolicy } from '@/lib/backups';
import { BACKUP_FREQUENCIES, MAX_KEEP, MIN_KEEP } from '@/lib/backups/format';
import { projectForBackups } from '@/lib/backups/access';

export const dynamic = 'force-dynamic';

const frequency = z.enum(BACKUP_FREQUENCIES as [string, ...string[]]);

// The account policy. Only the fields sent change - this never touches
// any other setting.
const accountSchema = z.object({
  frequency: frequency.optional(),
  notebooks: z.boolean().optional(),
  tasks: z.boolean().optional(),
  fullCopy: z.boolean().optional(),
  keep: z.number().int().min(MIN_KEEP).max(MAX_KEEP).optional(),
  email: z.boolean().optional(),
}).strict();

// One project's schedule.
const projectSchema = z.object({ projectId: z.string().min(1).max(100), frequency }).strict();

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  return NextResponse.json(await getBackupPolicy(session.userId));
}

export async function PUT(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const body = await req.json().catch(() => null);

  if (body && typeof body === 'object' && 'projectId' in body) {
    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Choose how often to back up this project.' }, { status: 400 });
    const project = await projectForBackups(parsed.data.projectId, session.userId);
    if (!project) return NextResponse.json({ error: 'You can’t change backups for this project.' }, { status: 403 });
    const updated = await db.project.update({
      where: { id: project.id },
      data: { backupFrequency: parsed.data.frequency as 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY' },
    });
    return NextResponse.json({ frequency: updated.backupFrequency, lastBackupAt: updated.lastBackupAt });
  }

  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Some backup settings are invalid.', details: parsed.error.flatten() }, { status: 400 });
  const p = parsed.data;
  const data = {
    ...(p.frequency !== undefined ? { backupFrequency: p.frequency as 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY' } : {}),
    ...(p.notebooks !== undefined ? { backupNotebooks: p.notebooks } : {}),
    ...(p.tasks !== undefined ? { backupTasks: p.tasks } : {}),
    ...(p.fullCopy !== undefined ? { backupFullCopy: p.fullCopy } : {}),
    ...(p.keep !== undefined ? { backupKeep: p.keep } : {}),
    ...(p.email !== undefined ? { backupEmail: p.email } : {}),
  };
  await db.setting.upsert({ where: { userId: session.userId }, update: data, create: { userId: session.userId, ...data } });
  return NextResponse.json(await getBackupPolicy(session.userId));
}
