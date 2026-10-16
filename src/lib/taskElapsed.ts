import { getLocalDateString, parseDateTimeInTimezone } from './dateUtils';

/**
 * Elapsed scheduled time for a task: how far into its planned slots the clock
 * has got. It is derived purely from the saved schedule and the current time,
 * never from a running in-memory timer, so a refresh or a schedule edit gives
 * the same answer straight away.
 *
 * This is deliberately NOT `Task.actualTime`. actualTime is the verified
 * duration, recomputed server-side from the slots that were ticked off
 * (recalculateTaskActualTime), and it is what a completed task reports here.
 */

type SlotLike = { start: string | Date; end: string | Date; completed?: boolean; taskId?: string | null };
type TaskLike = {
  id: string;
  status?: string;
  date?: string | Date;
  startTime?: string | null;
  endTime?: string | null;
  actualTime?: number;
};

export type ElapsedState = 'unscheduled' | 'not-started' | 'ongoing' | 'ended' | 'completed';

export interface TaskElapsed {
  state: ElapsedState;
  minutes: number;
}

/** The task's scheduled intervals: its linked calendar slots, else its own start/end on its date. */
export function getTaskSlotIntervals(
  task: TaskLike,
  events: SlotLike[],
  timezone: string
): Array<{ start: Date; end: Date; completed: boolean }> {
  const linked = (events || []).filter(e => e.taskId === task.id);
  if (linked.length > 0) {
    return linked
      .map(e => ({ start: new Date(e.start), end: new Date(e.end), completed: !!e.completed }))
      .filter(i => !isNaN(i.start.getTime()) && !isNaN(i.end.getTime()) && i.end > i.start);
  }
  if (task.startTime && task.endTime && task.date) {
    const dateStr = getLocalDateString(task.date, timezone);
    if (!dateStr) return [];
    const start = parseDateTimeInTimezone(dateStr, task.startTime, timezone);
    let end = parseDateTimeInTimezone(dateStr, task.endTime, timezone);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return [{ start, end, completed: task.status === 'COMPLETED' }];
  }
  return [];
}

/** Milliseconds of [start, end] that have already happened at `now` (0 before start, capped at end). */
export function elapsedWithin(start: Date, end: Date, now: Date): number {
  if (now <= start) return 0;
  return Math.min(now.getTime(), end.getTime()) - start.getTime();
}

/**
 * The one rule for an UNFINISHED (not ticked-off) slot: it counts from its
 * start up to now, capped at its end - all of it attributed to the day it
 * STARTED, so a slot begun at 23:30 that runs past midnight stays on that
 * day rather than being split. A slot that ended before the current local
 * day began is past and counts nothing until it's marked done.
 */
export function openSlotElapsedMs(start: Date, end: Date, now: Date, timezone: string): number {
  if (now <= start) return 0;
  const todayStart = parseDateTimeInTimezone(getLocalDateString(now, timezone), '00:00', timezone);
  if (end <= todayStart) return 0;
  return elapsedWithin(start, end, now);
}

export function getTaskElapsed(task: TaskLike, events: SlotLike[], timezone: string, now: Date = new Date()): TaskElapsed {
  const intervals = getTaskSlotIntervals(task, events, timezone);

  if (task.status === 'COMPLETED') {
    // Keep the existing completion record: the verified duration wins, and
    // only a task with no recorded time falls back to its scheduled slots.
    const fromSlots = intervals.reduce((s, i) => s + (i.end.getTime() - i.start.getTime()), 0) / 60000;
    const minutes = task.actualTime && task.actualTime > 0 ? task.actualTime * 60 : fromSlots;
    return { state: 'completed', minutes: Math.round(minutes) };
  }

  if (intervals.length === 0) return { state: 'unscheduled', minutes: 0 };

  // A ticked-off slot counts in full; an open slot counts only the part that
  // has already happened. A blocked task isn't being worked on, so its open
  // slots don't accrue.
  let ms = 0;
  for (const i of intervals) {
    if (i.completed) ms += i.end.getTime() - i.start.getTime();
    else if (task.status !== 'BLOCKED') ms += openSlotElapsedMs(i.start, i.end, now, timezone);
  }
  const minutes = Math.floor(ms / 60000);

  const open = intervals.filter(i => !i.completed);
  let state: ElapsedState;
  if (open.some(i => now >= i.start && now < i.end)) state = 'ongoing';
  else if (open.some(i => now < i.start)) state = minutes > 0 ? 'ongoing' : 'not-started';
  else state = 'ended';
  if (task.status === 'BLOCKED' && state === 'ongoing') state = minutes > 0 ? 'ended' : 'not-started';
  return { state, minutes };
}

/**
 * What an IN_PROGRESS task's row shows: time elapsed on its schedule and,
 * when it has an estimate, that time as a fraction of the estimate (capped
 * at 1 - the label keeps the real figure past it). This is elapsed time,
 * not "percent done".
 *
 * Rune has no separate start/stop clock: a task's start is its scheduled
 * slot (getTaskElapsed). An in-progress task with no slot has no start to
 * count from, so `minutes` is null - nothing is invented. A slot in the
 * future reads 0. A blocked task (Rune's only "paused" state) isn't
 * IN_PROGRESS, so it never gets an indicator.
 */
export interface ProgressIndicator {
  minutes: number | null;
  estimateMinutes: number | null;
  ratio: number | null;
  over: boolean;
  state: ElapsedState;
}

export function inProgressIndicator(
  task: TaskLike & { estimatedTime?: number | null },
  events: SlotLike[],
  timezone: string,
  now: Date = new Date()
): ProgressIndicator | null {
  if (task.status !== 'IN_PROGRESS') return null;
  const el = getTaskElapsed(task, events, timezone, now);
  const estimateMinutes = task.estimatedTime && task.estimatedTime > 0 ? Math.round(task.estimatedTime * 60) : null;
  if (el.state === 'unscheduled') return { minutes: null, estimateMinutes, ratio: null, over: false, state: el.state };
  const ratio = estimateMinutes ? Math.min(1, el.minutes / estimateMinutes) : null;
  return { minutes: el.minutes, estimateMinutes, ratio, over: !!estimateMinutes && el.minutes > estimateMinutes, state: el.state };
}

/** "45m", "1h05m". */
export function formatElapsedMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Scheduling form defaults (Up next → "Give it a time")
// ---------------------------------------------------------------------------

export type SlotDraft = { startTime: string; endTime: string };

/**
 * Starting slots when scheduling `task`: its own saved schedule if it has one
 * (editing), otherwise a single empty slot. Never anything from another task.
 */
export function initialScheduleSlots(
  task: TaskLike,
  events: SlotLike[],
  toLocalTime: (iso: string | Date) => string
): SlotDraft[] {
  const linked = (events || []).filter(e => e.taskId === task.id);
  if (linked.length > 0) {
    return linked.map(e => ({ startTime: toLocalTime(e.start), endTime: toLocalTime(e.end) }));
  }
  if (task.startTime && task.endTime) return [{ startTime: task.startTime, endTime: task.endTime }];
  return [{ startTime: '', endTime: '' }];
}

/**
 * Checks a schedule is complete before it's submitted. A slot with only one
 * end filled in is an error, never silently dropped.
 */
export function validateScheduleSlots(slots: SlotDraft[]): string | null {
  if (slots.some(s => !!s.startTime !== !!s.endTime)) {
    const i = slots.findIndex(s => !!s.startTime !== !!s.endTime);
    return `Time slot ${i + 1} needs both a start and an end time.`;
  }
  if (!slots.some(s => s.startTime && s.endTime)) return 'Pick a start and end time to schedule this task.';
  return null;
}
