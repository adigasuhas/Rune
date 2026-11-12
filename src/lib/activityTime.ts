import { getLocalDateString } from './dateUtils';
import { collectWorkIntervals, subtractIntervals } from './analyticsUtils';

/**
 * Breaks and brain drain: time inside the active day that isn't work.
 *
 * The accounting, in one place:
 *  - Working time = work intervals with every break and brain-drain
 *    stretch cut out (a break taken in the middle of a slot is not work).
 *  - Break and brain drain = the sessions themselves. A stretch recorded as
 *    both counts once, as a break.
 *  - Active time = working + break + brain drain. No moment is counted twice.
 *
 * A session belongs to the day it STARTED (the rule every Rune interval
 * follows), and a running session counts up to now.
 */

export type ActivityKind = 'BREAK' | 'BRAIN_DRAIN';

export interface ActivityLike {
  id?: string;
  kind: ActivityKind | string;
  start: Date | string;
  end: Date | string | null;
}

export interface Span { start: Date; end: Date }

export const ACTIVITY_LABEL: Record<ActivityKind, string> = { BREAK: 'Break', BRAIN_DRAIN: 'Brain drain' };

/** The session as an interval; a running one ends now. Null when malformed or not started yet. */
export function sessionSpan(s: ActivityLike, now: Date = new Date()): Span | null {
  const start = new Date(s.start);
  const end = s.end ? new Date(s.end) : now;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

/** Sorted, non-overlapping cover of `spans`. */
export function mergeSpans(spans: Array<{ start: Date; end: Date }>): Span[] {
  const sorted = spans
    .filter(s => s.end > s.start)
    .map(s => ({ start: new Date(s.start), end: new Date(s.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      if (s.end > last.end) last.end = s.end;
    } else out.push(s);
  }
  return out;
}

export function spanMs(spans: Array<{ start: Date; end: Date }>): number {
  return mergeSpans(spans).reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()), 0);
}

/** Milliseconds where the cover of `a` and the cover of `b` overlap. */
export function overlapMs(a: Array<{ start: Date; end: Date }>, b: Array<{ start: Date; end: Date }>): number {
  const A = mergeSpans(a);
  const B = mergeSpans(b);
  let i = 0;
  let j = 0;
  let ms = 0;
  while (i < A.length && j < B.length) {
    const s = Math.max(A[i].start.getTime(), B[j].start.getTime());
    const e = Math.min(A[i].end.getTime(), B[j].end.getTime());
    if (e > s) ms += e - s;
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return ms;
}

/** Break and brain-drain covers, with any stretch recorded as both counted as a break. */
export function awayCovers(sessions: ActivityLike[], now: Date = new Date()) {
  const breaks = mergeSpans(sessions.filter(s => s.kind === 'BREAK').map(s => sessionSpan(s, now)).filter((x): x is Span => !!x));
  const drain = mergeSpans(
    subtractIntervals(
      sessions.filter(s => s.kind === 'BRAIN_DRAIN').map(s => sessionSpan(s, now)).filter((x): x is Span => !!x),
      breaks
    )
  );
  return { breaks, drain, all: mergeSpans([...breaks, ...drain]) };
}

/** Sessions that started on `dateStr` in `timezone`. */
export function sessionsOnDay<T extends ActivityLike>(sessions: T[], dateStr: string, timezone: string): T[] {
  return sessions.filter(s => {
    try {
      return getLocalDateString(s.start, timezone) === dateStr;
    } catch {
      return false;
    }
  });
}

export interface DayAccount {
  workingMs: number;
  breakMs: number;
  drainMs: number;
  activeMs: number;
  breaks: number;
  drains: number;
}

/**
 * One day's account. `work` is that day's work intervals; `daySessions` are
 * the sessions that started that day; `allSessions` (defaults to the day's)
 * are cut out of work wherever they fall, so a session that began the night
 * before still isn't counted as work as well.
 */
export function accountDay(
  work: Array<{ start: Date; end: Date }>,
  daySessions: ActivityLike[],
  now: Date = new Date(),
  allSessions: ActivityLike[] = daySessions
): DayAccount {
  const day = awayCovers(daySessions, now);
  const all = awayCovers(allSessions, now).all;
  const workingMs = spanMs(subtractIntervals(work.map(w => ({ start: w.start, end: w.end })), all));
  const breakMs = spanMs(day.breaks);
  const drainMs = spanMs(day.drain);
  return {
    workingMs,
    breakMs,
    drainMs,
    activeMs: workingMs + breakMs + drainMs,
    breaks: daySessions.filter(s => s.kind === 'BREAK' && sessionSpan(s, now)).length,
    drains: daySessions.filter(s => s.kind === 'BRAIN_DRAIN' && sessionSpan(s, now)).length,
  };
}

/** Does [start, end) overlap any other session (ignoring `exceptId`)? Running sessions run to `now`. */
export function findOverlap<T extends ActivityLike>(
  start: Date,
  end: Date,
  sessions: T[],
  now: Date = new Date(),
  exceptId?: string
): T | null {
  for (const s of sessions) {
    if (exceptId && s.id === exceptId) continue;
    const span = sessionSpan(s, now);
    if (!span) continue;
    if (span.start < end && start < span.end) return s;
  }
  return null;
}

/** "1h 05m", "25m", "0m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Longest single entry: a forgotten timer shouldn't swallow a whole day silently. */
export const MAX_SESSION_MS = 12 * 3_600_000;

export function overlapMessage(clash: { kind: string; end: Date | string | null }): string {
  const label = (ACTIVITY_LABEL[clash.kind as ActivityKind] ?? 'Another entry').toLowerCase();
  return clash.end
    ? `That overlaps a ${label} you already recorded. Change the times so they don’t overlap.`
    : `That overlaps the ${label} that’s running now. Stop it first.`;
}

/**
 * accountDay for each of `days` (YYYY-MM-DD), from the user's tasks, calendar
 * slots and sessions. Today's figures include work and sessions under way.
 */
export function accountDays(
  days: string[],
  tasks: Array<{ date: string | Date } & Record<string, unknown>>,
  events: Array<{ start: string | Date } & Record<string, unknown>>,
  sessions: ActivityLike[],
  timezone: string,
  now: Date = new Date()
): Map<string, DayAccount> {
  const wanted = new Set(days);
  const group = <T,>(items: T[], at: (x: T) => string | Date) => {
    const m = new Map<string, T[]>();
    for (const x of items) {
      let d: string;
      try { d = getLocalDateString(at(x), timezone); } catch { continue; }
      if (!wanted.has(d)) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(x);
    }
    return m;
  };
  const tasksBy = group(tasks, t => t.date);
  const eventsBy = group(events, e => e.start);
  const sessionsBy = group(sessions, s => s.start);
  const out = new Map<string, DayAccount>();
  for (const d of days) {
    const work = collectWorkIntervals(d, tasksBy.get(d) || [], eventsBy.get(d) || [], timezone, undefined, now);
    out.set(d, accountDay(work, sessionsBy.get(d) || [], now, sessions));
  }
  return out;
}
