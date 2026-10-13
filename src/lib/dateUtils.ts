const TZ_MAP: Record<string, string> = {
  'EST': 'America/New_York',
  'PST': 'America/Los_Angeles',
  'IST': 'Asia/Kolkata',
  'CET': 'Europe/Berlin',
  'GMT': 'GMT'
};

function resolveTimezone(tz: string): string {
  if (!tz) return 'UTC';
  return TZ_MAP[tz] || tz;
}

// Building an Intl.DateTimeFormat is far slower than using one, and these
// helpers run per task per day (Analytics calls them tens of thousands of
// times), so keep one formatter per time zone. Construction still throws
// for an unknown zone, which the callers' fallbacks rely on.
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function ymdFormatter(tz: string): Intl.DateTimeFormat {
  let f = ymdFormatters.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz }); ymdFormatters.set(tz, f); }
  return f;
}

// A zone's UTC offset at noon on a given day, keyed "zone|YYYY-MM-DD".
const noonOffsets = new Map<string, number>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

/**
 * Converts a Date object or ISO string to local YYYY-MM-DD string in the given timezone.
 */
export function getLocalDateString(dateInput: Date | string | null | undefined, timezone: string): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const resolvedTz = resolveTimezone(timezone);
  try {
    return ymdFormatter(resolvedTz).format(d);
  } catch (e) {
    // Fallback to UTC split if formatting fails
    return d.toISOString().split('T')[0];
  }
}

/**
 * Converts a YYYY-MM-DD date string into a Date object at 00:00:00 in the given timezone.
 */
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // 1. Create a date in UTC at 12:00 PM (noon) to avoid DST boundary issues
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const resolvedTz = resolveTimezone(timezone);
  
  // 2. Format in target timezone to find the timezone difference at that day
  try {
    const formatter = partsFormatter(resolvedTz);
    
    const parts = formatter.formatToParts(utcNoon);
    const getVal = (type: string) => Number(parts.find(p => p.type === type)?.value);
    
    const tzYear = getVal('year');
    const tzMonth = getVal('month');
    const tzDay = getVal('day');
    const tzHour = getVal('hour');
    const tzMinute = getVal('minute');
    
    // Create UTC date representing timezone time
    const tzDateUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0);
    
    // Difference is the timezone offset in milliseconds
    const offset = tzDateUtc - utcNoon.getTime();
    
    // 00:00:00 local time is:
    const targetLocalStartUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    return new Date(targetLocalStartUtc - offset);
  } catch (e) {
    // Fallback to UTC
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  }
}

/**
 * Returns the current local date YYYY-MM-DD string in the given timezone.
 */
export function getCurrentDateInTimezone(timezone: string): string {
  return getLocalDateString(new Date(), timezone);
}

/**
 * Returns the start of the current day in the user's timezone as a Date object.
 */
export function getStartOfDayInTimezone(dateInput: Date | string, timezone: string): Date {
  const dateStr = typeof dateInput === 'string' && dateInput.includes('T')
    ? getLocalDateString(dateInput, timezone)
    : typeof dateInput === 'string'
      ? dateInput
      : getLocalDateString(dateInput, timezone);
      
  return parseDateInTimezone(dateStr, timezone);
}

/**
 * Returns the end of the day (23:59:59.999) in the given timezone as a Date object.
 */
export function getEndOfDayInTimezone(dateInput: Date | string, timezone: string): Date {
  const start = getStartOfDayInTimezone(dateInput, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Checks if the current time in the user's timezone is exactly 23:59.
 */
export function isEndOfDayInTimezone(timezone: string): boolean {
  try {
    const now = new Date();
    const resolvedTz = resolveTimezone(timezone);
    const localTimeStr = now.toLocaleTimeString('en-US', { timeZone: resolvedTz, hour12: false });
    const [hours, minutes] = localTimeStr.split(':').map(Number);
    return hours === 23 && minutes === 59;
  } catch (e) {
    return false;
  }
}

/**
 * Automatically converts legacy weekday selections into a list of YYYY-MM-DD date strings.
 * Generates all dates matching selected weekdays from 2025 through 2030.
 */
export function convertWeekdaysToDates(weekdaysStr: string, createdAt?: Date | string): string {
  if (!weekdaysStr) return '';
  if (weekdaysStr.includes('-')) {
    return weekdaysStr;
  }
  
  const weekdays = weekdaysStr.split(',').map(d => d.trim().toLowerCase());
  const weekdaysSet = new Set(weekdays);
  const dates: string[] = [];
  
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  const start = createdAt ? new Date(createdAt) : new Date();
  const end = new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
  
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  
  while (current <= endUtc) {
    const dayName = daysOfWeek[current.getUTCDay()];
    if (weekdaysSet.has(dayName)) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  const getMonthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  dates.push(`cfg:${getMonthKey(start)}`);
  dates.push(`cfg:${getMonthKey(end)}`);
  
  return dates.join(',');
}

/**
 * Whole-day difference between `target` and now, in the viewer's local
 * calendar (both dates floored to midnight so a deadline "today" reads as 0
 * regardless of the time of day it was set). Negative = in the past.
 */
export function daysUntil(target: Date | string): number {
  const d = typeof target === 'string' ? new Date(target) : target;
  if (isNaN(d.getTime())) return NaN;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(d);
  startOfTarget.setHours(0, 0, 0, 0);
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
}

/**
 * Relative-urgency phrasing for a deadline ("in 3 days", "due tomorrow",
 * "3 days overdue"). Implementation of the review's "deadline framing"
 * recommendation - an absolute date ("15 Oct") makes the reader do the
 * subtraction; the relative form triggers the urgency response directly.
 * Returns null when there is no usable date.
 */
export function formatRelativeDeadline(target: Date | string | null | undefined): string | null {
  if (!target) return null;
  const n = daysUntil(target);
  if (isNaN(n)) return null;
  if (n === 0) return 'due today';
  if (n === 1) return 'due tomorrow';
  if (n === -1) return '1 day overdue';
  if (n < 0) {
    const days = -n;
    if (days < 14) return `${days} days overdue`;
    if (days < 60) return `${Math.round(days / 7)} weeks overdue`;
    return `${Math.round(days / 30)} months overdue`;
  }
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30)} months`;
}

/**
 * ISO-8601 week key ("2026-W36") for a date in the given timezone. Used as
 * the dedupe key for the once-a-week digest so it fires exactly once per
 * calendar week per user.
 */
export function isoWeekKey(dateInput: Date | string, timezone: string): string {
  const ymd = getLocalDateString(dateInput, timezone); // YYYY-MM-DD in tz
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7; // Mon=1..Sun=7
  dt.setUTCDate(dt.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * YYYY-MM-DD of the Monday that starts the week containing `dateInput`, in
 * the given timezone.
 */
export function startOfWeekDateString(dateInput: Date | string, timezone: string): string {
  const ymd = getLocalDateString(dateInput, timezone);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt.toISOString().slice(0, 10);
}

export interface WorkingDayOverride {
  date: string; // YYYY-MM-DD
  type: string; // 'off' | 'leave' | 'other' - never 'working' (that's the absence of an override)
  comment: string;
}

/**
 * Parses Setting.workingDays down to just the explicit per-date overrides
 * ("YYYY-MM-DD:type[:comment]" entries) - skips bare dates (the initial
 * 31-day bootstrap window, implicitly 'working') and "cfg:YYYY-MM"
 * configured-month markers. Mirrors settings/page.tsx's client-side
 * getDayConfig parsing, as a server-side equivalent for anything that needs
 * to read leave/off days without duplicating that parsing.
 */
export function parseWorkingDaysOverrides(workingDaysStr: string): WorkingDayOverride[] {
  if (!workingDaysStr) return [];
  const overrides: WorkingDayOverride[] = [];
  for (const raw of workingDaysStr.split(',')) {
    const entry = raw.trim();
    if (!entry || entry.startsWith('cfg:')) continue;
    const [date, type, comment] = entry.split(':');
    if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // bare date (implicit 'working') or malformed - not an override
    overrides.push({ date, type, comment: comment || '' });
  }
  return overrides;
}

/**
 * Determines if a date is a default working day (Mon-Fri for the first month starting from account creation date).
 */
export function isDefaultWorking(dateStr: string, createdAt?: Date | string | null): boolean {
  const start = createdAt ? new Date(createdAt) : new Date();
  const end = new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
  
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  if (dateStr >= startStr && dateStr <= endStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }
  return false;
}

/**
 * Converts a YYYY-MM-DD date string and a HH:MM time string into a Date object in the given timezone.
 */
export function parseDateTimeInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const resolvedTz = resolveTimezone(timezone);
  const targetLocalStartUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const cacheKey = `${resolvedTz}|${dateStr}`;
  const cached = noonOffsets.get(cacheKey);
  if (cached !== undefined) return new Date(targetLocalStartUtc - cached);
  
  try {
    const formatter = partsFormatter(resolvedTz);
    
    const parts = formatter.formatToParts(utcNoon);
    const getVal = (type: string) => Number(parts.find(p => p.type === type)?.value);
    
    const tzYear = getVal('year');
    const tzMonth = getVal('month');
    const tzDay = getVal('day');
    const tzHour = getVal('hour');
    const tzMinute = getVal('minute');
    
    const tzDateUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0);
    const offset = tzDateUtc - utcNoon.getTime();
    if (noonOffsets.size > 20_000) noonOffsets.clear();
    noonOffsets.set(cacheKey, offset);
    return new Date(targetLocalStartUtc - offset);
  } catch (e) {
    return new Date(`${dateStr}T${timeStr}:00`);
  }
}


