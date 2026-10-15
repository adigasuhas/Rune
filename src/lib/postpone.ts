import { getLocalDateString } from './dateUtils';

/**
 * Postponement history (Task.postponeHistory, a JSON array) is a log of
 * events, kept separate from the task's schedule (Task.date). Each entry is
 * one move: { originalDate, newDate, reason?, movedAt }. A postponement
 * belongs to the day the task was moved FROM - postponing today's task to
 * tomorrow is something that happened to today, not to tomorrow - while the
 * task itself is scheduled on (and listed under) its new date.
 *
 * `originalDate` was historically stored as the task's full ISO timestamp
 * (local midnight); entries written now store the local YYYY-MM-DD. Both are
 * read back as a local day key.
 */
export interface PostponeEntry {
  originalDate: string;
  newDate: string;
  reason?: string;
  movedAt?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function parsePostponeHistory(raw: string | null | undefined): PostponeEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e === 'object') : [];
  } catch {
    return [];
  }
}

/** A history date (day key or ISO timestamp) as the local YYYY-MM-DD it refers to. */
export function postponeDayKey(value: string | null | undefined, timezone: string): string {
  if (!value) return '';
  if (DAY_KEY.test(value)) return value;
  return getLocalDateString(value, timezone);
}

/** How many times this task was postponed off `dayKey`. */
export function postponementsFrom(task: { postponeHistory?: string | null }, dayKey: string, timezone: string): number {
  return parsePostponeHistory(task.postponeHistory).filter((e) => postponeDayKey(e.originalDate, timezone) === dayKey).length;
}

/**
 * The tasks postponed off `dayKey` - wherever they're scheduled now. With no
 * day selected, every task that was ever postponed.
 */
export function tasksPostponedFrom<T extends { postponeHistory?: string | null }>(tasks: T[], dayKey: string | null, timezone: string): T[] {
  if (!dayKey) return tasks.filter((t) => parsePostponeHistory(t.postponeHistory).length > 0);
  return tasks.filter((t) => postponementsFrom(t, dayKey, timezone) > 0);
}

/** Total postponement events that originated on any of `dayKeys` (each event counted once). */
export function countPostponementsOnDays(tasks: Array<{ postponeHistory?: string | null }>, dayKeys: Iterable<string>, timezone: string): number {
  const days = new Set(dayKeys);
  let n = 0;
  for (const t of tasks) {
    for (const e of parsePostponeHistory(t.postponeHistory)) {
      if (days.has(postponeDayKey(e.originalDate, timezone))) n++;
    }
  }
  return n;
}

/**
 * Appends one postponement to a stored history - only for a move to a LATER
 * day (moving a task earlier, or within the same day, is rescheduling, not
 * postponing). Returns the history unchanged otherwise.
 */
export function appendPostponement(
  raw: string | null | undefined,
  fromDay: string,
  toDay: string,
  reason?: string | null,
  movedAt: Date = new Date()
): string {
  const history = parsePostponeHistory(raw);
  if (!DAY_KEY.test(fromDay) || !DAY_KEY.test(toDay) || toDay <= fromDay) return JSON.stringify(history);
  const entry: PostponeEntry = { originalDate: fromDay, newDate: toDay, movedAt: movedAt.toISOString() };
  const trimmed = reason?.trim();
  if (trimmed) entry.reason = trimmed.slice(0, 500);
  history.push(entry);
  return JSON.stringify(history);
}

/** "15 Oct 2026" for a history date, read as the local day it refers to. */
export function formatPostponeDay(value: string | null | undefined, timezone: string): string {
  const key = postponeDayKey(value, timezone);
  if (!key) return '';
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
