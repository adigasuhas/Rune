import { getLocalDateString } from '@/lib/dateUtils';
import { getTaskSlotIntervals } from '@/lib/taskElapsed';

/**
 * Pure helpers for the Tasks page's month calendar. Dates are plain
 * "YYYY-MM-DD" keys in the user's time zone, the same keys the rest of the
 * page uses, so a task lands on the same day here as in the list.
 */

export interface CalendarDay {
  key: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
};

/** "2026-11" for a date key or month key. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

/** The month `delta` months from `month` ("2026-11", -1 -> "2026-10"). */
export function shiftMonth(month: string, delta: number): string {
  const d = fromKey(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return keyOf(d).slice(0, 7);
}

/** `key` moved by `days` days. */
export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return keyOf(d);
}

/**
 * The weeks to draw for `month`, Monday first (as the rest of Rune counts
 * weeks): whole weeks from the one holding the 1st to the one holding the
 * last day, padded with the neighbouring months' days.
 */
export function monthGrid(month: string): CalendarDay[][] {
  const first = fromKey(`${month}-01`);
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  while (cursor <= last || weeks.length === 0) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ key: keyOf(cursor), day: cursor.getUTCDate(), inMonth: keyOf(cursor).startsWith(month) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

type CalendarTask = {
  id: string;
  date: string | Date | null;
  status?: string;
  priority?: string;
  estimatedTime?: number | null;
  startTime?: string | null;
  endTime?: string | null;
};
type SlotLike = Parameters<typeof getTaskSlotIntervals>[1][number];

export interface CalendarEntry<T> {
  task: T;
  /** Start of the task's first slot that day, if it has one. */
  start: Date | null;
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * Tasks grouped by their scheduled day, each day ordered the way you'd read
 * a plan: open tasks before done ones; timed tasks by start time, then the
 * untimed ones by priority.
 */
export function groupTasksByDay<T extends CalendarTask>(tasks: T[], events: SlotLike[], timezone: string): Record<string, CalendarEntry<T>[]> {
  const byDay: Record<string, CalendarEntry<T>[]> = {};
  for (const task of tasks) {
    const key = getLocalDateString(task.date, timezone);
    if (!key) continue;
    const starts = getTaskSlotIntervals({ ...task, date: task.date ?? undefined }, events, timezone).map((i) => i.start.getTime());
    (byDay[key] ??= []).push({ task, start: starts.length ? new Date(Math.min(...starts)) : null });
  }
  for (const entries of Object.values(byDay)) {
    entries.sort((a, b) => {
      const doneA = a.task.status === 'COMPLETED' ? 1 : 0;
      const doneB = b.task.status === 'COMPLETED' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      if (a.start && b.start) return a.start.getTime() - b.start.getTime();
      if (a.start || b.start) return a.start ? -1 : 1;
      return (PRIORITY_RANK[a.task.priority ?? ''] ?? 4) - (PRIORITY_RANK[b.task.priority ?? ''] ?? 4);
    });
  }
  return byDay;
}

/** Hours planned on a day: the sum of its tasks' estimates. */
export function plannedHours(entries: Array<{ task: CalendarTask }>): number {
  return Math.round(entries.reduce((h, e) => h + (e.task.estimatedTime && e.task.estimatedTime > 0 ? e.task.estimatedTime : 0), 0) * 10) / 10;
}
