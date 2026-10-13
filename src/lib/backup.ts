/**
 * Backup-restore validation (readiness review F7).
 *
 * The uploaded JSON was previously spread straight into `db.*.create` with no
 * validation, no size limit and no shape check - a malformed or hostile file
 * could inject fields, blow up memory, or crash mid-restore after the user's
 * data had already been wiped. `validateBackup` runs BEFORE any deletion:
 *  - the payload must be the object shape a RUNE export produces (`version`
 *    "1.0" + the expected named arrays);
 *  - every collection is row-capped and every string value length-capped;
 *  - server-owned / relation keys are stripped from every record, at any
 *    nesting depth, even when present in the file.
 * Field-level typing stays permissive on purpose - this restores the user's
 * own previously-exported data across a large model set - but nothing
 * unbounded or server-controlled survives.
 */

export const MAX_ROWS = 50_000;
export const MAX_STRING = 2_000_000;

const STRIP_KEYS = new Set([
  'userId', 'createdAt', 'updatedAt', 'user', 'project', 'notebook', 'task',
  'team', 'assignedBy', 'collaborators', 'wallNotes',
]);

export class BackupError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrub(input: unknown): any {
  if (Array.isArray(input)) {
    if (input.length > MAX_ROWS) throw new BackupError('This backup contains more records than can be restored.');
    return input.map(scrub);
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (k.startsWith('_') || k.startsWith('$') || STRIP_KEYS.has(k)) continue;
      if (typeof v === 'string' && v.length > MAX_STRING) throw new BackupError('A value in this backup is too large.');
      out[k] = v && typeof v === 'object' ? scrub(v) : v;
    }
    return out;
  }
  return input;
}

export interface BackupPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projects: any[]; notebooks: any[]; tasks: any[]; accomplishments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarEvents: any[]; instruments: any[]; jobs: any[]; notifications: any[];
}

export function validateBackup(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupError('This isn’t a valid Rune backup file.');
  }
  const r = raw as Record<string, unknown>;
  if (r.version !== '1.0') throw new BackupError('Unsupported backup version.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (key: string): any[] => {
    const v = r[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new BackupError(`Backup field “${key}” is malformed.`);
    return scrub(v);
  };
  return {
    settings: r.settings ? scrub(r.settings) : null,
    projects: arr('projects'),
    notebooks: arr('notebooks'),
    tasks: arr('tasks'),
    accomplishments: arr('accomplishments'),
    calendarEvents: arr('calendarEvents'),
    instruments: arr('instruments'),
    jobs: arr('jobs'),
    notifications: arr('notifications'),
  };
}
