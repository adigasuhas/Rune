/**
 * Review the Day: the date rules shared by the review form, the review
 * history and the "first focus" reminder on Today.
 *
 * Three dates, one relationship, all YYYY-MM-DD in the user's time zone:
 *   reviewDate      the day being reviewed (AccomplishmentRecord.date)
 *   focusDate       nextWorkingDay(reviewDate) - fixed when the review is
 *                   saved, so a Friday review points at Monday and later
 *                   changes to the calendar can't move an old reflection
 *   acknowledged    FirstFocusAck.focusDate - "seen" for that working day
 *
 * Working days follow the rule the Today page uses (getDayConfigOnDashboard
 * in src/app/page.tsx): an explicit per-date entry in Setting.workingDays
 * ("YYYY-MM-DD:type[:comment]") wins, and only type 'working' is a working
 * day; with no entry, Monday-Friday are working days.
 */

import { parseDateTimeInTimezone } from './dateUtils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isWorkingDate(dateStr: string, workingDays: string | null | undefined): boolean {
  const entry = (workingDays || '')
    .split(',')
    .map((d) => d.trim())
    .find((d) => d.startsWith(dateStr));
  if (entry) return (entry.split(':')[1] || 'working') === 'working';
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * The first working day after `dateStr`. Looks a year ahead; a calendar
 * with no working day in that span falls back to the next calendar day so
 * a review always has somewhere to point.
 */
export function nextWorkingDay(dateStr: string, workingDays: string | null | undefined): string {
  for (let i = 1; i <= 366; i++) {
    const d = addDays(dateStr, i);
    if (isWorkingDate(d, workingDays)) return d;
  }
  return addDays(dateStr, 1);
}

/** The lead-in before work starts during which the reminder already shows. */
export const FIRST_FOCUS_LEAD_MINUTES = 60;

function minutesOf(hhmm: string | null | undefined, fallback: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '') || /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  return Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]));
}

/**
 * When the first-focus reminder for `focusDate` may show: from an hour
 * before the working day starts until it ends. Before that (say 1am, still
 * finishing yesterday) it would be premature; after it, the day it was
 * for is over. A shift that ends before it starts runs to midnight.
 */
export function firstFocusWindow(
  focusDate: string,
  workStart: string | null | undefined,
  workEnd: string | null | undefined,
  timezone: string,
): { startsAt: Date; endsAt: Date } {
  const start = minutesOf(workStart, '08:00');
  const end = minutesOf(workEnd, '18:00');
  const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const startsAt = parseDateTimeInTimezone(focusDate, hhmm(Math.max(0, start - FIRST_FOCUS_LEAD_MINUTES)), timezone);
  const endsAt = end > start
    ? parseDateTimeInTimezone(focusDate, hhmm(end), timezone)
    : parseDateTimeInTimezone(addDays(focusDate, 1), '00:00', timezone);
  return { startsAt, endsAt };
}

/** "Monday 19 October" / "Mon 19 Oct" for a date key, independent of the viewer's zone. */
export function formatDateKey(dateStr: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString(undefined, style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * The phrase for which day a first focus is for, relative to the review:
 * "tomorrow" when it's the next calendar day, otherwise the weekday name
 * ("Monday"), or the full date when it's more than a week out.
 */
export function focusDayPhrase(reviewDate: string, focusDate: string): string {
  if (focusDate === addDays(reviewDate, 1)) return 'tomorrow';
  const gap = (Date.parse(`${focusDate}T00:00:00Z`) - Date.parse(`${reviewDate}T00:00:00Z`)) / 86_400_000;
  const d = new Date(`${focusDate}T12:00:00Z`);
  return gap <= 7
    ? d.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })
    : formatDateKey(focusDate, 'long');
}

export interface ReviewEntry {
  date: string;
  reviewedAt: string | null;
  updatedAt: string | null;
  wentWell: string | null;
  firstFocus: string | null;
  firstFocusDate: string | null;
  firstFocusTaskId: string | null;
  /** When the Today reminder for firstFocusDate was acknowledged, if it was. */
  acknowledgedAt?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toReviewEntry(r: any, acknowledgedAt?: Date | string | null): ReviewEntry {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    date: r.date,
    reviewedAt: iso(r.reviewedAt),
    updatedAt: iso(r.updatedAt),
    wentWell: r.wentWell ?? null,
    firstFocus: r.firstFocus ?? null,
    firstFocusDate: r.firstFocusDate ?? null,
    firstFocusTaskId: r.firstFocusTaskId ?? null,
    ...(acknowledgedAt !== undefined ? { acknowledgedAt: iso(acknowledgedAt) } : {}),
  };
}
