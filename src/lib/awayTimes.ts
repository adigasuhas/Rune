import { parseDateTimeInTimezone } from './dateUtils';
import { MAX_SESSION_MS } from './activityTime';

/** "14:05" in `tz` (24-hour, for <input type="time">). */
export function hhmm(at: string | Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  } catch {
    return '';
  }
}

/** YYYY-MM-DD of `at` in `tz`. */
export function ymdIn(at: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

export function shiftDay(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2:05 PM" in `tz`. */
export function clockIn(at: string | Date, tz: string): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

export interface DraftCheck {
  start: Date | null;
  end: Date | null;
  /** The end is on the next day (an end time at or before the start). */
  crossesMidnight: boolean;
  error: string | null;
}

/**
 * Start and end times entered for `day`. An end at or before the start means
 * the entry ran past midnight; the whole entry still belongs to `day`, the
 * day it started.
 */
export function checkDraft(day: string, start: string, end: string, tz: string, now: Date = new Date()): DraftCheck {
  if (!day || !start || !end) return { start: null, end: null, crossesMidnight: false, error: null };
  const s = parseDateTimeInTimezone(day, start, tz);
  let e = parseDateTimeInTimezone(day, end, tz);
  let crossesMidnight = false;
  if (e <= s) {
    e = new Date(e.getTime() + 86_400_000);
    crossesMidnight = true;
  }
  let error: string | null = null;
  if (e.getTime() - s.getTime() > MAX_SESSION_MS) error = 'One entry can be at most 12 hours.';
  else if (s.getTime() > now.getTime()) error = 'That hasn’t started yet. Use Step away to start one now.';
  else if (e.getTime() > now.getTime() + 60_000) error = 'That ends in the future. Log it once it’s over, or start it now.';
  return { start: s, end: e, crossesMidnight, error };
}
