import { zipSync, strToU8, type Zippable } from 'fflate';
import { getLocalDateString, isoWeekKey } from '../dateUtils';

/**
 * The pure half of automatic backups: when one is due, and how its files are
 * laid out and written. No database access, so it is unit-tested directly.
 */

export type BackupFrequency = 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export const BACKUP_FREQUENCIES: BackupFrequency[] = ['OFF', 'DAILY', 'WEEKLY', 'MONTHLY'];

/** Newest backups kept per account / project, and the range a user may pick. */
export const DEFAULT_KEEP = 7;
export const MIN_KEEP = 1;
export const MAX_KEEP = 30;

/** Largest .zip stored (and the most attachments copied in). Bigger backups keep their text and skip files. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** Above this a backup is not emailed (most mail servers refuse it); the email says where to download it. */
export const MAX_EMAIL_BYTES = 10 * 1024 * 1024;

/**
 * Due when the period it belongs to has rolled over since the last backup,
 * in the user's own time zone: a new day, a new ISO week (Monday), or a new
 * month. Calendar periods rather than "24 hours later", so a once-a-day job
 * that runs a little earlier or later each day never skips one.
 */
export function isBackupDue(frequency: BackupFrequency, lastBackupAt: Date | null, now: Date, timezone: string): boolean {
  if (frequency === 'OFF') return false;
  if (!lastBackupAt) return true;
  const last = getLocalDateString(lastBackupAt, timezone);
  const today = getLocalDateString(now, timezone);
  if (frequency === 'DAILY') return last !== today;
  if (frequency === 'WEEKLY') return isoWeekKey(lastBackupAt, timezone) !== isoWeekKey(now, timezone);
  return last.slice(0, 7) !== today.slice(0, 7);
}

/** A name safe on Windows, macOS and Linux, and unique within `taken` (adds " (2)", " (3)" …). */
export function safeFileName(name: string, taken: Set<string>, ext = ''): string {
  const base =
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s-]+|[.\s]+$/g, '')
      .slice(0, 80) || 'Untitled';
  let candidate = `${base}${ext}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** "rune-backup-2026-11-02-1530.zip" / "rune-project-thesis-2026-11-02-1530.zip", in the user's time. */
export function backupFileName(now: Date, timezone: string, projectName?: string | null): string {
  const date = getLocalDateString(now, timezone);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .replace(':', '');
  if (!projectName) return `rune-backup-${date}-${time}.zip`;
  const slug = projectName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
  return `rune-project-${slug}-${date}-${time}.zip`;
}

/**
 * One CSV cell. Quoted when needed, and a leading = + - @ (or tab/CR) gets a
 * ' prefix so a spreadsheet opening the file never runs it as a formula.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel reads UTF-8 (accents, symbols) correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export interface BackupSummary {
  notebooks: number;
  tasks: number;
  attachments: number;
  fullCopy: boolean;
  skippedAttachments: number;
}

export function readme(opts: { title: string; createdAt: Date; timezone: string; summary: BackupSummary; scope: 'account' | 'project' }): string {
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: opts.timezone, dateStyle: 'long', timeStyle: 'short' }).format(opts.createdAt);
  const s = opts.summary;
  const lines = [
    opts.title,
    '='.repeat(opts.title.length),
    '',
    `Made ${when} (${opts.timezone}).`,
    '',
    'What is inside',
    '--------------',
  ];
  if (s.notebooks) {
    lines.push(
      `notebooks/   ${s.notebooks} notebook${s.notebooks === 1 ? '' : 's'}. Each one twice:`,
      '             .tex   the LaTeX source, exactly as written in Rune',
      '             .html  a readable copy with the maths typeset; opens in any browser',
    );
    if (s.attachments) lines.push(`             files attached to a notebook sit in a folder next to it (${s.attachments}).`);
    if (s.skippedAttachments) lines.push(`             ${s.skippedAttachments} attachment(s) were not copied (too large, or stored elsewhere); attachments.csv lists their links.`);
  }
  if (s.tasks) {
    lines.push(
      `tasks/       ${s.tasks} task${s.tasks === 1 ? '' : 's'}.`,
      '             tasks.csv   opens in Excel, Numbers or Google Sheets',
      '             tasks.json  every field, including scheduled time slots',
    );
  }
  if (opts.scope === 'project') lines.push('project.json  the project itself: name, goals, status, dates.');
  if (s.fullCopy) {
    lines.push(
      'rune-backup.json',
      '             your whole workspace in Rune\'s own format. To bring it back, open',
      '             Rune → Settings → Backups → Restore backup and choose this .zip (or',
      '             this file). Restoring replaces what is in the account you restore into.',
    );
  }
  if (!s.notebooks && !s.tasks && !s.fullCopy) lines.push('Nothing - every part of this backup is turned off in Settings → Backups.');
  lines.push('');
  return lines.join('\n');
}

/** Files (path → text or bytes) into one .zip, all under a single top folder. */
export function buildZip(folder: string, files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Zippable = {};
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? strToU8(content) : content;
    // Images and PDFs are already compressed: store them as they are.
    entries[`${folder}/${name}`] = /\.(png|jpe?g|gif|webp|pdf|zip)$/i.test(name) ? [data, { level: 0 }] : data;
  }
  return zipSync(entries, { level: 6, mtime: new Date() });
}

/** A readable, self-contained HTML page for one rendered notebook. */
export function notebookHtml(title: string, bodyHtml: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css">
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.65; color: #1f2328; }
  h1 { font-size: 2rem; font-weight: 600; margin-bottom: .25rem; }
  h2, h3, h4 { font-weight: 600; margin-top: 2em; }
  table { border-collapse: collapse; } th, td { border-bottom: 1px solid #d0d7de; padding: .4rem .7rem; text-align: left; }
  pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .88em; }
  pre { white-space: pre-wrap; background: #f6f8fa; padding: .8rem; border-radius: 6px; }
  img { max-width: 100%; }
  ul { list-style: disc; } ul ul { list-style-type: "–  "; } ol ol { list-style-type: lower-alpha; } ol ol ol { list-style-type: lower-roman; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${bodyHtml}
</body>
</html>
`;
}
