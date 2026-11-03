/**
 * Day kinds, leave and availability: one set of rules for the Settings
 * calendar, the Tasks calendar and anything else that colours a day.
 *
 * Per-date choices live in Setting.workingDays as "YYYY-MM-DD:type[:reason]"
 * entries (see parseWorkingDaysOverrides in dateUtils). With no typed entry
 * a day follows the default week (Monday-Friday working, the weekend off),
 * as Today, Analytics and the daily review already do - and a day outside
 * the user's availability dates is "unavailable".
 */

export type DayKind = 'working' | 'weeklyOff' | 'leave' | 'sick' | 'other' | 'unavailable';

/** The types a day can be set to, in the order they're offered. */
export const DAY_TYPES = [
  { value: 'working', kind: 'working', label: 'Working day', short: 'Working' },
  { value: 'off', kind: 'weeklyOff', label: 'Weekly off', short: 'Off' },
  { value: 'leave', kind: 'leave', label: 'Leave', short: 'Leave' },
  { value: 'sick', kind: 'sick', label: 'Sick leave', short: 'Sick' },
  { value: 'other', kind: 'other', label: 'Other', short: 'Other' },
] as const satisfies ReadonlyArray<{ value: string; kind: DayKind; label: string; short: string }>;

export type DayType = (typeof DAY_TYPES)[number]['value'];

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  working: 'Working day',
  weeklyOff: 'Weekly off',
  leave: 'Leave',
  sick: 'Sick leave',
  other: 'Other',
  unavailable: 'Not available',
};

/** One word for a calendar cell. */
export const DAY_KIND_SHORT: Record<DayKind, string> = {
  working: 'Working',
  weeklyOff: 'Off',
  leave: 'Leave',
  sick: 'Sick',
  other: 'Other',
  unavailable: 'Away',
};

/** Types that are not a working day - for code that only asks "working or not". */
export const NON_WORKING_TYPES: readonly string[] = ['off', 'leave', 'sick', 'other'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export interface DayEntry {
  /** 'working' for a bare date (the account's first-month bootstrap) or an explicit working day. */
  type: string;
  comment: string;
  /** True when the user picked the type, false for a bare bootstrap date. */
  typed: boolean;
}

/** Every per-date entry in Setting.workingDays, by date. */
export function parseDayEntries(workingDays: string | null | undefined): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  for (const raw of (workingDays || '').split(',')) {
    const entry = raw.trim();
    if (!entry || entry.startsWith('cfg:')) continue;
    const [date, type, ...rest] = entry.split(':');
    if (!DATE_RE.test(date)) continue;
    map.set(date, { type: type || 'working', comment: rest.join(':'), typed: !!type });
  }
  return map;
}

export interface Availability {
  from?: string | null; // YYYY-MM-DD, inclusive
  until?: string | null; // YYYY-MM-DD, inclusive
}

export function isAvailableOn(key: string, availability?: Availability | null): boolean {
  if (!availability) return true;
  if (availability.from && key < availability.from) return false;
  if (availability.until && key > availability.until) return false;
  return true;
}

function kindOfType(type: string): DayKind {
  switch (type) {
    case 'off': return 'weeklyOff';
    case 'leave': return 'leave';
    case 'sick': return 'sick';
    case 'other': return 'other';
    default: return 'working'; // 'working' and anything unrecognised, as elsewhere in Rune
  }
}

/** Saturday or Sunday. */
export function isWeekend(key: string): boolean {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * What kind of day `key` is. A type the user chose always wins; otherwise
 * a day outside the availability dates is unavailable, and the rest follow
 * the default week.
 */
export function dayKind(key: string, entries: Map<string, DayEntry>, availability?: Availability | null): DayKind {
  const entry = entries.get(key);
  if (entry?.typed) return kindOfType(entry.type);
  if (!isAvailableOn(key, availability)) return 'unavailable';
  if (entry) return 'working';
  return isWeekend(key) ? 'weeklyOff' : 'working';
}

/** The type to preselect when editing `key` (what it is now). */
export function dayTypeOf(key: string, entries: Map<string, DayEntry>): DayType {
  const entry = entries.get(key);
  if (entry?.typed && DAY_TYPES.some((t) => t.value === entry.type)) return entry.type as DayType;
  if (entry) return 'working';
  return isWeekend(key) ? 'off' : 'working';
}

/** A reason can't hold the separators the stored format uses. */
export function cleanReason(text: string): string {
  return text.replace(/[,:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Every date from `from` to `to` inclusive (either order), at most 366 days. */
export function dateRange(from: string, to: string): string[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  const d = new Date(`${a}T00:00:00Z`);
  for (let i = 0; i < 366; i++) {
    const key = d.toISOString().slice(0, 10);
    if (key > b) break;
    out.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Setting.workingDays with `dates` set to `type` (and `reason`). Always a
 * typed entry, so the choice also holds outside the availability dates.
 */
export function setDayTypes(workingDays: string, dates: string[], type: DayType, reason = ''): string {
  const targets = new Set(dates);
  const comment = cleanReason(reason);
  const kept = (workingDays || '').split(',').map((d) => d.trim()).filter((d) => d && !targets.has(d.split(':')[0]));
  const markers = new Set(kept.filter((d) => d.startsWith('cfg:')));
  for (const date of dates) {
    kept.push(`${date}:${type}${comment ? `:${comment}` : ''}`);
    const marker = `cfg:${date.slice(0, 7)}`;
    if (!markers.has(marker)) { markers.add(marker); kept.push(marker); }
  }
  return kept.join(',');
}

/** Setting.workingDays with any choice for `dates` removed (back to the default week). */
export function clearDayTypes(workingDays: string, dates: string[]): string {
  const targets = new Set(dates);
  return (workingDays || '').split(',').map((d) => d.trim()).filter((d) => d && !targets.has(d.split(':')[0])).join(',');
}

export type LeavePeriod = 'YEAR' | 'PERIOD';

export interface LeaveWindow {
  from: string | null;
  until: string | null;
  label: string;
}

/**
 * The span leave is counted over: the calendar year holding `todayKey`, or
 * the availability dates (open ends run unbounded) when the allowance is
 * for the whole period.
 */
export function leaveWindow(period: LeavePeriod, todayKey: string, availability?: Availability | null): LeaveWindow {
  if (period === 'PERIOD' && (availability?.from || availability?.until)) {
    return { from: availability.from || null, until: availability.until || null, label: 'your available dates' };
  }
  const year = todayKey.slice(0, 4);
  return { from: `${year}-01-01`, until: `${year}-12-31`, label: year };
}

/** Leave and sick days marked inside the window. */
export function countLeave(entries: Map<string, DayEntry>, window: { from: string | null; until: string | null }) {
  let leave = 0;
  let sick = 0;
  for (const [date, entry] of entries) {
    if (!entry.typed) continue;
    if (window.from && date < window.from) continue;
    if (window.until && date > window.until) continue;
    if (entry.type === 'leave') leave++;
    else if (entry.type === 'sick') sick++;
  }
  return { leave, sick };
}

/** Length of the working day in hours ("08:00"-"18:00" -> 10); 8 when unreadable. */
export function workdayHours(start: string | null | undefined, end: string | null | undefined): number {
  const mins = (t: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  let diff = mins(end) - mins(start);
  if (Number.isNaN(diff)) return 8;
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

/**
 * 0-4: how full a day was, as hours worked against the working day. 0 is
 * nothing logged; 4 is three quarters of the day or more.
 */
export function intensityLevel(hoursWorked: number, dayHours: number): 0 | 1 | 2 | 3 | 4 {
  if (!(hoursWorked > 0)) return 0;
  const ratio = hoursWorked / (dayHours > 0 ? dayHours : 8);
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function formatHours(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}h`;
}
