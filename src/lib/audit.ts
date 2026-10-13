/**
 * Append-only audit log for privileged (admin / developer-console) actions.
 *
 * Writes newline-delimited JSON to `${RUNE_DATA_DIR|./data}/audit.log`. The
 * directory is git-ignored. On a read-only/serverless filesystem the write
 * fails silently to a console warning rather than breaking the action - a
 * self-host on a persistent disk is where this log matters.
 */
import fs from 'fs';
import path from 'path';

export interface AuditEntry {
  actorId: string;
  actorEmail: string;
  action: string; // e.g. "user.role.update", "user.delete", "user.create"
  targetId?: string;
  targetEmail?: string;
  detail?: Record<string, unknown>;
}

function auditFilePath(): string {
  const dir = process.env.RUNE_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
  return path.join(/*turbopackIgnore: true*/ dir, 'audit.log');
}

export function recordAudit(entry: AuditEntry): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  try {
    const file = auditFilePath();
    fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    fs.appendFileSync(/*turbopackIgnore: true*/ file, line, 'utf-8');
  } catch (err) {
    console.warn('[audit] could not persist entry:', (err as Error).message, '-', line.trim());
  }
}

export function readRecentAudit(limit = 200): Array<Record<string, unknown>> {
  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ auditFilePath(), 'utf-8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return { raw: l };
        }
      });
  } catch {
    return [];
  }
}
