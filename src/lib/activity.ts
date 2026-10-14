/**
 * Daily working time, for the activity graph (Today: compact, Analytics:
 * the full year). One cell per day; the primary measure is time actually
 * worked - completed calendar blocks plus completed tasks with a recorded
 * time, overlaps counted once (the same rule Analytics uses for "hours
 * worked", see calculateOccupiedHoursFromItems). Tasks completed are
 * secondary context.
 *
 * Deliberately neutral: levels are just bands of hours, and the summary
 * lines describe patterns ("your busiest month was March"), never judge a
 * day as good or bad.
 */
import { calculateOccupiedHoursFromItems } from './analyticsUtils';
import { getLocalDateString } from './dateUtils';

export type DayActivity = { date: string; hours: number; completed: number; level: 0 | 1 | 2 | 3 | 4 };

/** Upper bounds (hours) for levels 1-3; anything above the last is level 4. */
export const LEVEL_BOUNDS = [1.5, 3.5, 5.5] as const;

export function levelFor(hours: number): DayActivity['level'] {
  if (hours <= 0) return 0;
  if (hours < LEVEL_BOUNDS[0]) return 1;
  if (hours < LEVEL_BOUNDS[1]) return 2;
  if (hours < LEVEL_BOUNDS[2]) return 3;
  return 4;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday
}

/** Every day from `start` to `end` inclusive (YYYY-MM-DD), with its hours and completions. */
export function dailyActivity(
  tasks: Array<{ date: string | Date; status?: string } & Record<string, unknown>>,
  events: Array<{ start: string | Date } & Record<string, unknown>>,
  timezone: string,
  start: string,
  end: string,
): DayActivity[] {
  const tByDay = new Map<string, typeof tasks>();
  for (const t of tasks || []) {
    let d: string;
    try { d = getLocalDateString(t.date, timezone); } catch { continue; }
    if (d < start || d > end) continue;
    (tByDay.get(d) ?? tByDay.set(d, []).get(d)!).push(t);
  }
  const eByDay = new Map<string, typeof events>();
  for (const e of events || []) {
    let d: string;
    try { d = getLocalDateString(e.start, timezone); } catch { continue; }
    if (d < start || d > end) continue;
    (eByDay.get(d) ?? eByDay.set(d, []).get(d)!).push(e);
  }
  const out: DayActivity[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dt = tByDay.get(d) ?? [];
    const de = eByDay.get(d) ?? [];
    const hours = dt.length || de.length ? calculateOccupiedHoursFromItems(d, dt, de, timezone) : 0;
    const completed = dt.filter((t) => t.status === 'COMPLETED').length;
    out.push({ date: d, hours, completed, level: levelFor(hours) });
  }
  return out;
}

/** A start date `weeks` whole weeks before `end`, aligned to a Monday so columns are clean weeks. */
export function rangeStart(end: string, weeks: number): string {
  const back = addDays(end, -(weeks * 7 - 1));
  const dow = dayOfWeek(back);
  return addDays(back, -((dow + 6) % 7));
}

/** The Monday on or before `ymd`. */
export function mondayOf(ymd: string): string {
  return addDays(ymd, -((dayOfWeek(ymd) + 6) % 7));
}

/** Today's "Recent weeks" span: about two months for an established account, never more. */
export const RECENT_WEEKS_DEFAULT = 8;
/** ...and about one month when activity has only just begun. */
export const RECENT_WEEKS_COMPACT = 4;

/**
 * Where Today's "Recent weeks" graph starts (a Monday). It used to always
 * show 26 weeks, which for most people was months of empty squares:
 *
 *  - Established history: the last ~2 months. Older weeks are one click
 *    away in Analytics; the default never grows just because data exists.
 *  - Activity that only began recently (a new account, or an old account
 *    that's only now being used): from the first active week, but at least
 *    the last ~month so the graph isn't a sliver.
 *  - No activity at all: the last ~month.
 *
 * And never before the week the account was created, so a new account
 * doesn't show weeks from before it existed.
 */
export function recentWeeksStart({
  today,
  memberSince,
  firstActivity,
}: {
  today: string;
  memberSince?: string | null;
  firstActivity?: string | null;
}): string {
  // N whole weeks ending with this one.
  const established = addDays(mondayOf(today), -7 * (RECENT_WEEKS_DEFAULT - 1));
  const compact = addDays(mondayOf(today), -7 * (RECENT_WEEKS_COMPACT - 1));
  let start: string;
  if (!firstActivity || firstActivity > today) start = compact;
  else if (firstActivity >= established) start = mondayOf(firstActivity) < compact ? mondayOf(firstActivity) : compact;
  else start = established;
  if (memberSince && memberSince <= today && mondayOf(memberSince) > start) start = mondayOf(memberSince);
  return start;
}

/**
 * The first day (YYYY-MM-DD, user's zone) with real activity - a completed
 * task or a calendar block that has started - on or before `today`. Account
 * creation isn't activity: people often sign up long before they use Rune.
 */
export function firstActiveDay(
  tasks: Array<{ date: string | Date; status?: string }>,
  events: Array<{ start: string | Date }>,
  timezone: string,
  today: string,
): string | null {
  let first: string | null = null;
  const consider = (when: string | Date) => {
    let d: string;
    try { d = getLocalDateString(when, timezone); } catch { return; }
    if (d <= today && (!first || d < first)) first = d;
  };
  for (const t of tasks || []) if (t.status === 'COMPLETED') consider(t.date);
  for (const e of events || []) consider(e.start);
  return first;
}

export function formatHours(h: number): string {
  const mins = Math.round(h * 60);
  if (mins <= 0) return '0m';
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return hh ? (mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh}h`) : `${mm}m`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export type ActivitySummary = {
  totalHours: number;
  daysWorked: number;
  averagePerDayWorked: number;
  busiestMonth: { name: string; hours: number } | null;
  longestWeekday: string | null;
  lines: string[];
};

/** Neutral, descriptive observations about a range of days. */
export function summarize(days: DayActivity[]): ActivitySummary {
  const worked = days.filter((d) => d.hours > 0);
  const totalHours = worked.reduce((s, d) => s + d.hours, 0);
  const averagePerDayWorked = worked.length ? totalHours / worked.length : 0;

  const byMonth = new Map<string, number>();
  for (const d of worked) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.hours);
  let busiestMonth: ActivitySummary['busiestMonth'] = null;
  for (const [key, hours] of byMonth) if (!busiestMonth || hours > busiestMonth.hours) busiestMonth = { name: MONTHS[Number(key.slice(5, 7)) - 1], hours };

  const byDow = Array.from({ length: 7 }, () => ({ h: 0, n: 0 }));
  for (const d of worked) { const w = dayOfWeek(d.date); byDow[w].h += d.hours; byDow[w].n += 1; }
  let best = -1, bestAvg = 0;
  byDow.forEach((x, i) => { if (x.n >= 3 && x.h / x.n > bestAvg) { bestAvg = x.h / x.n; best = i; } });
  const longestWeekday = best >= 0 ? WEEKDAYS[best] : null;

  const lines: string[] = [];
  if (worked.length) {
    lines.push(`${formatHours(totalHours)} of focused work across ${worked.length} ${worked.length === 1 ? 'day' : 'days'}.`);
    lines.push(`On the days you worked, you averaged ${formatHours(averagePerDayWorked)}.`);
    if (busiestMonth && byMonth.size > 1) lines.push(`Your busiest month was ${busiestMonth.name}.`);
    if (longestWeekday) lines.push(`${longestWeekday} tend to be your longest days.`);
  }
  return { totalHours, daysWorked: worked.length, averagePerDayWorked, busiestMonth, longestWeekday, lines };
}

/**
 * Where to centre a floating card of half-width `half` over a point at `x`
 * so it stays inside a box `boxWidth` wide. When the box is narrower than
 * the card it is centred in the box rather than pushed off one edge.
 */
export function clampCardCenter(x: number, half: number, boxWidth: number): number {
  if (boxWidth <= 2 * half) return boxWidth / 2;
  return Math.min(Math.max(x, half), boxWidth - half);
}
