import { db } from '../db';
import { buildAccountExport } from '../accountExport';
import { parseMarkdownToHtml, stripPageMetadata, type ExportPage } from '../notebookExport';
import { readLocalUpload } from '../storage';
import { isSmtpConfigured, sendMail } from '../mailer';
import {
  type BackupFrequency,
  type BackupSummary,
  DEFAULT_KEEP,
  MAX_ATTACHMENT_BYTES,
  MAX_BACKUP_BYTES,
  MAX_EMAIL_BYTES,
  backupFileName,
  buildZip,
  isBackupDue,
  notebookHtml,
  readme,
  safeFileName,
  toCsv,
} from './format';

/**
 * Automatic and on-demand .zip backups.
 *
 * An account backup follows the policy in Settings → Backups (what goes in,
 * how often, how many to keep, whether to email it). A project backup holds
 * that project's notebooks and tasks, on the project's own schedule, and
 * uses the same policy for what goes in and how many are kept.
 *
 * Finished backups are stored in the database (hosts like Vercel have no
 * disk that survives) and listed for download where they were set up; the
 * newest `keep` are kept. Scheduled ones are made by the daily job
 * (/api/cron/backups) and, as a fallback on hosts without one, when the
 * owner next opens Rune (/api/backups/run-due).
 */

export interface BackupPolicy {
  frequency: BackupFrequency;
  notebooks: boolean;
  tasks: boolean;
  fullCopy: boolean;
  keep: number;
  email: boolean;
  lastBackupAt: Date | null;
}

export class BackupTooLargeError extends Error {}

export async function getBackupPolicy(userId: string): Promise<BackupPolicy> {
  const s = await db.setting.findUnique({ where: { userId } });
  return {
    frequency: (s?.backupFrequency as BackupFrequency) ?? 'OFF',
    notebooks: s?.backupNotebooks ?? true,
    tasks: s?.backupTasks ?? true,
    fullCopy: s?.backupFullCopy ?? true,
    keep: s?.backupKeep ?? DEFAULT_KEEP,
    email: s?.backupEmail ?? false,
    lastBackupAt: s?.lastBackupAt ?? null,
  };
}

/** What the list and API return: everything but the bytes. */
export interface BackupMeta {
  id: string;
  projectId: string | null;
  trigger: string;
  fileName: string;
  sizeBytes: number;
  contents: BackupSummary;
  createdAt: Date;
  emailed?: boolean;
}

export const BACKUP_META_SELECT = { id: true, projectId: true, trigger: true, fileName: true, sizeBytes: true, contents: true, createdAt: true } as const;

type Row = Record<string, unknown>;
type Files = Record<string, string | Uint8Array>;

function dateOnly(v: unknown): string {
  if (!v) return '';
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** notebooks/<group>/<title>.tex + .html (+ attachments), and an attachments.csv index. */
async function addNotebooks(files: Files, notebooks: Row[], projectNames: Map<string, string>, summary: BackupSummary, withFiles: boolean) {
  const taken = new Set<string>();
  const attachmentRows: unknown[][] = [];
  let attachmentBytes = 0;
  // The renderer resolves \ref and \cite across the set it's given.
  const pagesArray: ExportPage[] = notebooks.map((nb) => {
    const page = (nb.page as Row | null) ?? {};
    return { id: String(page.id ?? ''), title: String(nb.title ?? ''), content: String(page.content ?? ''), tags: (page.tags as string[]) ?? [] };
  });

  for (const nb of notebooks) {
    const page = (nb.page as Row | null) ?? {};
    const group = nb.projectId ? projectNames.get(nb.projectId as string) ?? 'Project' : 'Personal';
    const folder = `notebooks/${safeFileName(group, new Set())}`;
    const name = safeFileName(String(nb.title || 'Untitled'), taken);
    const source = stripPageMetadata(String(page.content ?? ''));
    files[`${folder}/${name}.tex`] = source;
    let body: string;
    try {
      body = parseMarkdownToHtml(source, pagesArray, String(page.id ?? ''));
    } catch {
      body = `<pre>${source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
    }
    files[`${folder}/${name}.html`] = notebookHtml(String(nb.title || 'Untitled'), body);
    summary.notebooks++;

    const attachments = (page.attachments as Row[] | undefined) ?? [];
    const attachTaken = new Set<string>();
    for (const a of attachments) {
      const url = String(a.url ?? '');
      let copied = '';
      if (withFiles && url.startsWith('/api/uploads/') && attachmentBytes + Number(a.size ?? 0) <= MAX_ATTACHMENT_BYTES) {
        const data = await readLocalUpload(url.slice('/api/uploads/'.length));
        if (data) {
          copied = `${folder}/${name} files/${safeFileName(String(a.filename || 'file'), attachTaken)}`;
          files[copied] = new Uint8Array(data);
          attachmentBytes += data.length;
          summary.attachments++;
        }
      }
      if (!copied) summary.skippedAttachments++;
      attachmentRows.push([nb.title, a.filename, a.mimeType, a.size, copied || '', url]);
    }
  }
  if (attachmentRows.length) {
    files['notebooks/attachments.csv'] = toCsv(['Notebook', 'File', 'Type', 'Bytes', 'In this backup', 'Link'], attachmentRows);
  }
}

/** tasks/tasks.csv (one row a task) and tasks/tasks.json (every field, with its slots). */
function addTasks(files: Files, tasks: Row[], events: Row[], projectNames: Map<string, string>, summary: BackupSummary) {
  const slotsByTask = new Map<string, Row[]>();
  for (const e of events) {
    if (!e.taskId) continue;
    const list = slotsByTask.get(e.taskId as string) ?? [];
    list.push({ start: e.start, end: e.end, completed: e.completed });
    slotsByTask.set(e.taskId as string, list);
  }
  const ordered = [...tasks].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  files['tasks/tasks.csv'] = toCsv(
    ['Task', 'Status', 'Priority', 'Date', 'Start', 'End', 'Estimated hours', 'Actual hours', 'Project', 'Session', 'Effort', 'Impact', 'Detail', 'Created', 'Updated'],
    ordered.map((t) => [
      t.name, t.status, t.priority, dateOnly(t.date), t.startTime ?? '', t.endTime ?? '', t.estimatedTime ?? '', t.actualTime ?? '',
      t.projectId ? projectNames.get(t.projectId as string) ?? '' : '', t.sessionType ?? '', t.effort ?? '', t.impact ?? '', t.detail ?? '',
      t.createdAt, t.updatedAt,
    ])
  );
  files['tasks/tasks.json'] = JSON.stringify(ordered.map((t) => ({ ...t, slots: slotsByTask.get(t.id as string) ?? [] })), null, 2);
  summary.tasks = tasks.length;
}

/**
 * Makes one backup now and stores it. `projectId` null = the account backup.
 * The caller has already checked the user may back up that project.
 */
export async function createBackup(opts: { userId: string; projectId?: string | null; trigger: 'SCHEDULED' | 'MANUAL'; now?: Date }): Promise<BackupMeta> {
  const now = opts.now ?? new Date();
  const projectId = opts.projectId ?? null;
  const user = await db.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error('No such user');
  const tz = user.timezone || 'UTC';
  const policy = await getBackupPolicy(opts.userId);

  const summary: BackupSummary = { notebooks: 0, tasks: 0, attachments: 0, fullCopy: false, skippedAttachments: 0 };
  let notebooks: Row[] = [];
  let tasks: Row[] = [];
  let project: Row | null = null;
  if (projectId) {
    project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('No such project');
    if (policy.notebooks) notebooks = await db.notebook.findMany({ where: { projectId } });
    if (policy.tasks) tasks = await db.task.findMany({ where: { projectId } });
  } else {
    if (policy.notebooks) notebooks = await db.notebook.findMany({ where: { userId: opts.userId } });
    if (policy.tasks) tasks = await db.task.findMany({ where: { userId: opts.userId } });
  }
  const taskIds = tasks.map((t) => t.id as string);
  const events = taskIds.length ? await db.calendarEvent.findMany({ where: { taskId: { in: taskIds } } }) : [];
  const projectIds = [...new Set([...notebooks, ...tasks].map((r) => r.projectId).filter(Boolean) as string[])];
  const projects = projectIds.length ? await db.project.findMany({ where: { id: { in: projectIds } } }) : [];
  const projectNames = new Map<string, string>(projects.map((p: Row) => [p.id as string, p.name as string]));

  const fileName = backupFileName(now, tz, project ? (project.name as string) : null);
  const folder = fileName.replace(/\.zip$/, '');

  const assemble = async (withFiles: boolean) => {
    const files: Files = {};
    const s: BackupSummary = { ...summary };
    if (notebooks.length) await addNotebooks(files, notebooks, projectNames, s, withFiles);
    if (policy.tasks && (tasks.length || !projectId)) addTasks(files, tasks, events, projectNames, s);
    if (project) {
      const { id, name, description, goals, status, priority, startDate, deadline, color, createdAt } = project;
      files['project.json'] = JSON.stringify({ id, name, description, goals, status, priority, startDate, deadline, color, createdAt }, null, 2);
    }
    if (!projectId && policy.fullCopy) {
      files['rune-backup.json'] = JSON.stringify(await buildAccountExport(opts.userId, user.name), null, 2);
      s.fullCopy = true;
    }
    const title = project ? `Rune backup of the project “${project.name}”` : `Rune backup for ${user.name || user.email}`;
    files['README.txt'] = readme({ title, createdAt: now, timezone: tz, summary: s, scope: project ? 'project' : 'account' });
    return { zip: buildZip(folder, files), summary: s };
  };

  let { zip, summary: finalSummary } = await assemble(true);
  if (zip.length > MAX_BACKUP_BYTES) ({ zip, summary: finalSummary } = await assemble(false));
  if (zip.length > MAX_BACKUP_BYTES) {
    throw new BackupTooLargeError(`This backup would be ${Math.round(zip.length / 1048576)} MB, over the ${MAX_BACKUP_BYTES / 1048576} MB limit.`);
  }

  const saved = await db.backup.create({
    data: {
      userId: opts.userId,
      projectId,
      trigger: opts.trigger,
      fileName,
      sizeBytes: zip.length,
      contents: finalSummary as unknown as object,
      data: Buffer.from(zip),
      createdAt: now,
    },
    select: BACKUP_META_SELECT,
  });

  // Keep the newest `keep` for this account / project; drop the rest.
  const old = await db.backup.findMany({
    where: { userId: opts.userId, projectId },
    orderBy: { createdAt: 'desc' },
    skip: Math.max(1, policy.keep),
    select: { id: true },
  });
  if (old.length) await db.backup.deleteMany({ where: { id: { in: old.map((b: { id: string }) => b.id) } } });

  if (projectId) await db.project.update({ where: { id: projectId }, data: { lastBackupAt: now } });
  else await db.setting.upsert({ where: { userId: opts.userId }, update: { lastBackupAt: now }, create: { userId: opts.userId, lastBackupAt: now } });

  let emailed = false;
  if (policy.email && isSmtpConfigured() && user.email) {
    const where = project ? `the project “${project.name}” in Rune` : 'Settings → Backups in Rune';
    emailed = zip.length <= MAX_EMAIL_BYTES
      ? await sendMail({
          to: user.email,
          subject: `Your Rune backup: ${fileName}`,
          text: `Your ${opts.trigger === 'SCHEDULED' ? 'scheduled ' : ''}backup is attached (${fileName}). It is also kept in ${where}.\n`,
          attachments: [{ filename: fileName, content: Buffer.from(zip), contentType: 'application/zip' }],
        })
      : await sendMail({
          to: user.email,
          subject: `Your Rune backup is ready: ${fileName}`,
          text: `Your backup is ${Math.round(zip.length / 1048576)} MB, too large to attach. Download it from ${where}.\n`,
        });
  }

  return { ...(saved as BackupMeta), emailed };
}

/** Every backup of this user's that is due now: the account's and each project they own. Errors are logged, not thrown. */
export async function runDueBackups(userId: string, now: Date = new Date()): Promise<BackupMeta[]> {
  const made: BackupMeta[] = [];
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return made;
  const tz = user.timezone || 'UTC';
  const policy = await getBackupPolicy(userId);
  const jobs: Array<string | null> = [];
  if (isBackupDue(policy.frequency, policy.lastBackupAt, now, tz)) jobs.push(null);
  const projects = await db.project.findMany({ where: { userId, backupFrequency: { not: 'OFF' } } });
  for (const p of projects) {
    if (isBackupDue(p.backupFrequency as BackupFrequency, p.lastBackupAt ?? null, now, tz)) jobs.push(p.id);
  }
  for (const projectId of jobs) {
    try {
      made.push(await createBackup({ userId, projectId, trigger: 'SCHEDULED', now }));
    } catch (err) {
      console.error(`[backups] scheduled backup failed for user ${userId}${projectId ? ` project ${projectId}` : ''}:`, err);
    }
  }
  return made;
}

/** The daily job: everyone with a schedule. */
export async function runAllDueBackups(now: Date = new Date()): Promise<{ users: number; backups: number }> {
  const [settings, projects] = await Promise.all([
    db.setting.findMany({ where: { backupFrequency: { not: 'OFF' } }, select: { userId: true } }),
    db.project.findMany({ where: { backupFrequency: { not: 'OFF' } }, select: { userId: true } }),
  ]);
  const userIds = [...new Set([...settings, ...projects].map((r: { userId: string }) => r.userId))];
  let backups = 0;
  for (const id of userIds) backups += (await runDueBackups(id, now)).length;
  return { users: userIds.length, backups };
}
