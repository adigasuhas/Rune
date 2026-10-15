/**
 * Utility functions for calculating working-day aware analytics.
 */
import { getLocalDateString, convertWeekdaysToDates, parseDateTimeInTimezone } from './dateUtils';
import { countPostponementsOnDays } from './postpone';
import { openSlotElapsedMs } from './taskElapsed';

/**
 * Parses a comma-separated string of working days and returns a Set of lowercase day names.
 */
export function getWorkingDaysSet(workingDaysConfig: string): Set<string> {
  const defaultDays = 'monday,tuesday,wednesday,thursday,friday';
  const config = workingDaysConfig || defaultDays;
  return new Set(config.split(',').map(d => d.trim().toLowerCase()));
}

function parseToUtcDate(dInput: Date | string): Date {
  if (typeof dInput === 'string') {
    const cleanStr = dInput.split('T')[0];
    const [year, month, day] = cleanStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  } else {
    return new Date(Date.UTC(dInput.getUTCFullYear(), dInput.getUTCMonth(), dInput.getUTCDate(), 0, 0, 0));
  }
}

/**
 * Returns list of working days (as YYYY-MM-DD strings) between startDate and endDate (inclusive).
 */
/**
 * Returns list of working days (as YYYY-MM-DD strings) between startDate and endDate (inclusive).
 */
function isWorkingDay(dateStr: string, workingDaysConfig: string): boolean {
  const list = (workingDaysConfig || '').split(',').map(d => d.trim()).filter(Boolean);
  const entry = list.find(d => d.startsWith(dateStr));
  if (entry) {
    const parts = entry.split(':');
    const type = parts[1] || 'working';
    return type === 'working' || !['off', 'leave', 'other'].includes(type);
  }
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    return day >= 1 && day <= 5; // Monday - Friday
  } catch (e) {
    return true;
  }
}

export function getWorkingDaysBetween(
  startDate: Date | string,
  endDate: Date | string,
  workingDaysConfig: string,
  accountCreationDate?: Date | string
): string[] {
  const startStr = typeof startDate === 'string' ? startDate.split('T')[0] : startDate.toISOString().split('T')[0];
  const endStr = typeof endDate === 'string' ? endDate.split('T')[0] : endDate.toISOString().split('T')[0];
  
  if (startStr > endStr) {
    return [];
  }

  const result: string[] = [];
  const current = new Date(startStr + 'T00:00:00Z');
  const endLimit = new Date(endStr + 'T00:00:00Z');
  
  for (let i = 0; i < 366; i++) {
    if (current > endLimit) break;
    const dateStr = current.toISOString().split('T')[0];
    if (isWorkingDay(dateStr, workingDaysConfig)) {
      result.push(dateStr);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return result;
}

export function getLastNWorkingDays(
  endDate: Date | string,
  n: number,
  workingDaysConfig: string,
  accountCreationDate?: Date | string
): string[] {
  const endStr = typeof endDate === 'string' ? endDate.split('T')[0] : endDate.toISOString().split('T')[0];
  const startLimitStr = accountCreationDate
    ? (typeof accountCreationDate === 'string' ? accountCreationDate.split('T')[0] : accountCreationDate.toISOString().split('T')[0])
    : null;

  const result: string[] = [];
  const current = new Date(endStr + 'T00:00:00Z');
  
  for (let i = 0; i < 100; i++) {
    if (result.length >= n) break;
    
    const dateStr = current.toISOString().split('T')[0];
    if (startLimitStr && dateStr < startLimitStr) {
      break;
    }
    
    if (isWorkingDay(dateStr, workingDaysConfig)) {
      result.push(dateStr);
    }
    
    current.setUTCDate(current.getUTCDate() - 1);
  }
  
  return result.reverse();
}

export function getIntervalUnionDuration(intervals: Array<{ start: Date | string | number; end: Date | string | number }>): number {
  if (intervals.length === 0) return 0;
  const ranges = intervals
    .map(inv => {
      const startMs = new Date(inv.start).getTime();
      const endMs = new Date(inv.end).getTime();
      return { startMs, endMs };
    })
    .filter(r => !isNaN(r.startMs) && !isNaN(r.endMs) && r.startMs < r.endMs);

  if (ranges.length === 0) return 0;

  ranges.sort((a, b) => a.startMs - b.startMs);

  const merged: Array<{ startMs: number; endMs: number }> = [];
  let current = ranges[0];

  for (let i = 1; i < ranges.length; i++) {
    const next = ranges[i];
    if (next.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, next.endMs);
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  const totalMs = merged.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
  return totalMs / (1000 * 60 * 60);
}

/**
 * Parses a task's postponeHistory JSON array and returns how many times it was moved.
 * This is the sole live postponement signal — the legacy carryForwardCount field was
 * only ever written by a disabled rollover routine and is always 0.
 */
export function getPostponeCount(task: any): number {
  if (!task || !task.postponeHistory) return 0;
  try {
    const parsed = JSON.parse(task.postponeHistory);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Canonical productivity score formula (0-100).
 * completionRate: 0-100. deepWorkHours/workHours: hours occupied that day.
 *
 * `postponeCount` is accepted for call-site compatibility but no longer
 * scored. The old formula subtracted up to 10 points for moving tasks off
 * their planned date; per the behavioral review that penalised a legitimate,
 * adaptive replanning behaviour (self-determination theory - autonomy) and
 * turned the score into a compliance stick. Rescheduling is now neutral; a
 * postponed-but-completed task already scores through `completionRate`.
 *
 * Anchoring: a genuinely good-not-perfect day - ~80% of planned tasks done,
 * ~3h deep work, ~6h tracked - lands around 75. A flawless day (100% / 4h /
 * 8h) is 100. A day with no activity is a real 0 (the dashboard and
 * analytics render an empty state, not a number, when `hasAnyActivity` is
 * false, so 0 always means real inactivity, never "you showed up").
 */
export function calculateProductivityScore(params: {
  completionRate: number;
  deepWorkHours: number;
  workHours: number;
  postponeCount?: number;
}): number {
  const { completionRate, deepWorkHours, workHours } = params;
  const rateScore = completionRate * 0.5;
  const deepScore = Math.min((deepWorkHours / 4) * 100, 100) * 0.3;
  const workScore = Math.min((workHours / 8) * 100, 100) * 0.2;
  const score = Math.round(rateScore + deepScore + workScore);
  return Math.max(Math.min(score, 100), 0);
}

/** True when there is any signal a productivity score can be based on. */
export function hasAnyActivity(params: {
  completionRate: number;
  deepWorkHours: number;
  workHours: number;
  tasksPlanned?: number;
}): boolean {
  return (
    params.completionRate > 0 ||
    params.deepWorkHours > 0 ||
    params.workHours > 0 ||
    (params.tasksPlanned ?? 0) > 0
  );
}

/**
 * sessionTypes: restrict counted tasks/events to these SessionType values (e.g. ['DEEP_WORK']
 * or ['DEEP_WORK', 'FOCUS']). Omit/undefined to count occupied hours across all session types.
 */
/**
 * Core interval-building logic, assuming dayTasks/dayEvents are ALREADY
 * filtered to the given date. Split out from calculateOccupiedHoursForDay so
 * callers that already have data grouped by date (e.g. calculateWorkingDayMetrics
 * below, or a UI iterating many days) can skip re-scanning the full
 * tasks/calendarEvents arrays on every single day.
 */
export function calculateOccupiedHoursFromItems(
  dateStr: string,
  dayTasks: any[],
  dayEvents: any[],
  timezone: string,
  sessionTypes?: string[],
  now?: Date
): number {
  const intervals: Array<{ start: Date; end: Date }> = [];

  const filteredEvents = (dayEvents || []).filter(e => {
    if (!e.completed) return false;
    if (sessionTypes && !sessionTypes.includes(e.sessionType)) return false;
    return true;
  });

  filteredEvents.forEach(e => {
    intervals.push({ start: new Date(e.start), end: new Date(e.end) });
  });

  const filteredTasks = (dayTasks || []).filter(t => {
    if (t.status !== 'COMPLETED') return false;
    if (sessionTypes && !sessionTypes.includes(t.sessionType)) return false;
    return true;
  });

  const eventTaskIds = new Set(filteredEvents.map(e => e.taskId).filter(Boolean));

  filteredTasks.forEach(t => {
    if (eventTaskIds.has(t.id)) {
      return;
    }

    if (t.startTime && t.endTime) {
      try {
        const start = parseDateTimeInTimezone(dateStr, t.startTime, timezone);
        let end = parseDateTimeInTimezone(dateStr, t.endTime, timezone);
        if (end <= start) {
          end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
        }
        intervals.push({ start, end });
        return;
      } catch {
        // Fallback
      }
    }

    // No calendar slot and no recorded actual time for this task - there's
    // nothing real to count. Deliberately NOT falling back to estimatedTime
    // here: this feeds "hours worked" analytics, which must reflect time
    // actually spent, not planned/guessed duration.
    if (!(t.actualTime > 0)) {
      return;
    }

    try {
      const start = parseDateTimeInTimezone(dateStr, '09:00', timezone);
      const end = new Date(start.getTime() + t.actualTime * 60 * 60 * 1000);
      intervals.push({ start, end });
    } catch {
      // ignore
    }
  });

  // Opt-in (pass `now`): open work that has already started counts from its
  // scheduled start up to now, capped at its scheduled end (openSlotElapsedMs)
  // - so the day's "worked" figure moves while a slot is under way instead of
  // waiting for the tick. Every interval here belongs to the day it STARTS on
  // (dayEvents are grouped by start, a task's own slot is on its date), so
  // overnight work is never split at midnight. Derived from the saved
  // schedule each time, so it survives a refresh and follows schedule edits.
  // Stored history (accomplishments, analytics) omits `now` and stays
  // completed-only.
  if (now) {
    (dayTasks || []).forEach(t => {
      if (t.status === 'COMPLETED' || t.status === 'BLOCKED') return;
      if (sessionTypes && !sessionTypes.includes(t.sessionType)) return;
      const slots = (dayEvents || []).filter(e => e.taskId === t.id);
      if (slots.length > 0) {
        slots.forEach(e => {
          if (e.completed) return; // already counted above
          const start = new Date(e.start);
          const end = new Date(e.end);
          const ms = end > start ? openSlotElapsedMs(start, end, now, timezone) : 0;
          if (ms > 0) intervals.push({ start, end: new Date(start.getTime() + ms) });
        });
        return;
      }
      if (t.startTime && t.endTime) {
        try {
          const start = parseDateTimeInTimezone(dateStr, t.startTime, timezone);
          let end = parseDateTimeInTimezone(dateStr, t.endTime, timezone);
          if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
          const ms = openSlotElapsedMs(start, end, now, timezone);
          if (ms > 0) intervals.push({ start, end: new Date(start.getTime() + ms) });
        } catch {
          // ignore
        }
      }
    });
  }

  return getIntervalUnionDuration(intervals);
}

export function calculateOccupiedHoursForDay(
  dateStr: string,
  tasks: any[],
  calendarEvents: any[],
  timezone: string,
  sessionTypes?: string[],
  now?: Date
): number {
  const dayEvents = (calendarEvents || []).filter(e => {
    try {
      return getLocalDateString(e.start, timezone) === dateStr;
    } catch {
      return false;
    }
  });

  const dayTasks = (tasks || []).filter(t => {
    try {
      return getLocalDateString(t.date, timezone) === dateStr;
    } catch {
      return false;
    }
  });

  return calculateOccupiedHoursFromItems(dateStr, dayTasks, dayEvents, timezone, sessionTypes, now);
}

function groupByLocalDate(items: any[], dateField: string, timezone: string): Map<string, any[]> {
  const map = new Map<string, any[]>();
  (items || []).forEach(item => {
    if (!item || !item[dateField]) return;
    try {
      const dateStr = getLocalDateString(item[dateField], timezone);
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(item);
    } catch {
      // ignore unparseable dates
    }
  });
  return map;
}

/**
 * Calculates working-day aware analytics over a list of working days.
 */
export function calculateWorkingDayMetrics(
  workingDays: string[],
  tasks: any[],
  accomplishments: any[],
  calendarEvents: any[] = [],
  timezone: string = 'UTC'
) {
  const workingDaysSet = new Set(workingDays);

  // Group once (O(items)) instead of re-scanning the full tasks/calendarEvents
  // arrays for every working day below (O(days x items)) - with a year or more
  // of history this loop runs per toggle (e.g. "show off-days"), so the O(items)
  // grouping cost matters a lot less than paying the full scan up to ~5x per day.
  const tasksByDate = groupByLocalDate(tasks, 'date', timezone);
  const eventsByDate = groupByLocalDate(calendarEvents, 'start', timezone);
  const accomplishmentByDate = new Map<string, any>();
  (accomplishments || []).forEach(a => {
    if (a && a.date) accomplishmentByDate.set(a.date, a);
  });

  // Filter tasks to only those scheduled on working days
  const tasksOnWorkingDays = tasks.filter(t => {
    const taskDate = getLocalDateString(t.date, timezone);
    return workingDaysSet.has(taskDate);
  });

  // 1. Completion Rate. BLOCKED tasks are excluded from the denominator - you
  // cannot complete work that is waiting on someone else, so counting it
  // against you would penalise an external dependency (same principle as
  // dropping the postponement penalty).
  const rateEligibleTasks = tasksOnWorkingDays.filter(t => t.status !== 'BLOCKED');
  const completedTasks = rateEligibleTasks.filter(t => t.status === 'COMPLETED');
  const totalTasksCount = tasksOnWorkingDays.length;
  const rateDenominator = rateEligibleTasks.length;
  const completedTasksCount = completedTasks.length;
  const completionRate = rateDenominator > 0
    ? Math.round((completedTasksCount / rateDenominator) * 100)
    : 0;

  // 2. Average Working Hours
  let totalWorkingHours = 0;
  workingDays.forEach(dateStr => {
    totalWorkingHours += calculateOccupiedHoursFromItems(dateStr, tasksByDate.get(dateStr) || [], eventsByDate.get(dateStr) || [], timezone);
  });
  const avgWorkingHours = workingDays.length > 0
    ? Math.round((totalWorkingHours / workingDays.length) * 10) / 10
    : 0;

  // 3. Deep Work Hours (total and average per working day)
  let totalDeepWorkHours = 0;
  workingDays.forEach(dateStr => {
    totalDeepWorkHours += calculateOccupiedHoursFromItems(dateStr, tasksByDate.get(dateStr) || [], eventsByDate.get(dateStr) || [], timezone, ['DEEP_WORK']);
  });
  const avgDeepWorkHours = workingDays.length > 0
    ? Math.round((totalDeepWorkHours / workingDays.length) * 10) / 10
    : 0;

  // 3b. Focus-only Hours (FOCUS session type, distinct from Deep Work)
  let totalFocusOnlyHours = 0;
  workingDays.forEach(dateStr => {
    totalFocusOnlyHours += calculateOccupiedHoursFromItems(dateStr, tasksByDate.get(dateStr) || [], eventsByDate.get(dateStr) || [], timezone, ['FOCUS']);
  });

  // 4. Productivity Score (average of daily productivity scores on working days)
  let totalProductivityScore = 0;
  let scoreCount = 0;

  workingDays.forEach(dateStr => {
    const record = accomplishmentByDate.get(dateStr);
    if (record) {
      totalProductivityScore += record.productivityScore;
      scoreCount++;
    } else {
      // Calculate inline productivity score for working day
      // (dateStr is always a working day here, since we're iterating workingDays)
      const dayTasks = tasksByDate.get(dateStr) || [];
      if (dayTasks.length > 0) {
        const rateEligible = dayTasks.filter(t => t.status !== 'BLOCKED');
        const rate = rateEligible.length > 0
          ? Math.round((rateEligible.filter(t => t.status === 'COMPLETED').length / rateEligible.length) * 100)
          : 0;

        const dayEvents = eventsByDate.get(dateStr) || [];
        const deepHours = calculateOccupiedHoursFromItems(dateStr, dayTasks, dayEvents, timezone, ['DEEP_WORK']);
        const workHours = calculateOccupiedHoursFromItems(dateStr, dayTasks, dayEvents, timezone);
        const postponeCount = dayTasks.reduce((sum, t) => sum + getPostponeCount(t), 0);

        totalProductivityScore += calculateProductivityScore({
          completionRate: rate,
          deepWorkHours: deepHours,
          workHours,
          postponeCount
        });
        scoreCount++;
      }
    }
  });

  const avgProductivityScore = scoreCount > 0
    ? Math.round(totalProductivityScore / scoreCount)
    : 0;

  // 5. Focus Time (total time spent in a concentrated state: Deep Work + Focus sessions combined)
  const totalFocusTime = totalDeepWorkHours + totalFocusOnlyHours;

  // 6. Postponement Rate (tasks moved off their original date, per working day)
  // Each move is counted once, on the day it was postponed FROM - not on the
  // task's current (new) date.
  const totalPostponeCount = countPostponementsOnDays(tasks, workingDays, timezone);
  const postponementRate = workingDays.length > 0
    ? Math.round((totalPostponeCount / workingDays.length) * 100) / 100 // rounded to 2 decimals
    : 0;

  return {
    workingDaysCount: workingDays.length,
    totalTasksCount,
    completedTasksCount,
    completionRate,
    totalWorkingHours,
    avgWorkingHours,
    totalDeepWorkHours,
    avgDeepWorkHours,
    totalFocusOnlyHours,
    avgProductivityScore,
    totalFocusTime,
    totalPostponeCount,
    postponementRate
  };
}

/**
 * Detects all dates (as YYYY-MM-DD strings) on which user activity occurred.
 */
export function getActiveDays(
  tasks: any[] = [],
  accomplishments: any[] = [],
  calendarEvents: any[] = [],
  notebookPages: any[] = [],
  projects: any[] = [],
  timezone: string = 'UTC'
): Set<string> {
  const activeDays = new Set<string>();

  const formatDate = (dateInput: any) => {
    if (!dateInput) return '';
    return getLocalDateString(dateInput, timezone);
  };

  // 1. Task completed (on that day)
  tasks.forEach(t => {
    if (t.status === 'COMPLETED' && t.date) {
      const d = formatDate(t.date);
      if (d) activeDays.add(d);
    }
  });

  // 2. Calendar event completed (on that day)
  calendarEvents.forEach(e => {
    if (e.completed && e.start) {
      const d = formatDate(e.start);
      if (d) activeDays.add(d);
    }
  });

  // 3. Deep work session recorded
  // (already covered by task completed with sessionType DEEP_WORK)
  tasks.forEach(t => {
    if (t.status === 'COMPLETED' && t.sessionType === 'DEEP_WORK' && t.date) {
      const d = formatDate(t.date);
      if (d) activeDays.add(d);
    }
  });

  // 4. Notebook page updated
  notebookPages.forEach(p => {
    if (p.updatedAt) {
      const d = formatDate(p.updatedAt);
      if (d) activeDays.add(d);
    }
    if (p.date) {
      activeDays.add(p.date); // For daily research logs with explicit associated date
    }
  });

  // 5. Project progress updated
  projects.forEach(p => {
    if (p.updatedAt) {
      const d = formatDate(p.updatedAt);
      if (d) activeDays.add(d);
    }
  });

  // 6. Accomplishment records
  accomplishments.forEach(a => {
    if (a.date) {
      activeDays.add(a.date);
    }
  });

  return activeDays;
}

/**
 * Takes configured working days and active days, and returns a merged list of all days to be included in analytics.
 * This includes all configured working days, plus any non-working days where user activity was detected.
 */
export function getAnalyticsDays(
  baseWorkingDays: string[],
  activeDays: Set<string>,
  startDateLimit?: string,
  endDateLimit?: string
): string[] {
  const merged = new Set(baseWorkingDays);
  
  activeDays.forEach(day => {
    // If we have range limits, ensure the active day falls within them
    if (startDateLimit && day < startDateLimit) return;
    if (endDateLimit && day > endDateLimit) return;
    merged.add(day);
  });

  return Array.from(merged).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

/**
 * Finds the nearest working day in the workingDays array for a given dateStr.
 */
export function getNearestWorkingDay(dateStr: string, workingDays: string[]): string {
  if (workingDays.length === 0) return dateStr;
  if (workingDays.includes(dateStr)) return dateStr;
  
  let nearest = workingDays[0];
  let minDiff = Infinity;
  const targetTime = new Date(dateStr + 'T12:00:00Z').getTime();
  
  for (const wd of workingDays) {
    const diff = Math.abs(new Date(wd + 'T12:00:00Z').getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = wd;
    }
  }
  return nearest;
}

/**
 * Shifts work items (tasks, calendar events, accomplishments) from off-days
 * to the nearest configured working day.
 */
export function shiftOffDaysWork(
  workingDays: string[],
  tasks: any[],
  accomplishments: any[],
  calendarEvents: any[],
  timezone: string
) {
  if (workingDays.length === 0) {
    return { tasks, accomplishments, calendarEvents };
  }
  
  const minDay = workingDays[0];
  const maxDay = workingDays[workingDays.length - 1];
  const workingDaysSet = new Set(workingDays);
  
  const nearestDayCache: Record<string, { nearest: string; diffMs: number }> = {};
  
  const getShiftInfo = (dateStr: string) => {
    if (!dateStr || dateStr < minDay || dateStr > maxDay) return null;
    if (workingDaysSet.has(dateStr)) return null;
    
    if (nearestDayCache[dateStr] !== undefined) {
      return nearestDayCache[dateStr];
    }
    
    const nearest = getNearestWorkingDay(dateStr, workingDays);
    const diffMs = new Date(nearest + 'T12:00:00Z').getTime() - new Date(dateStr + 'T12:00:00Z').getTime();
    const info = { nearest, diffMs };
    nearestDayCache[dateStr] = info;
    return info;
  };

  const shiftedTasks = tasks.map(t => {
    if (!t || !t.date) return t;
    const taskDate = getLocalDateString(t.date, timezone);
    const shift = getShiftInfo(taskDate);
    if (!shift) return t;
    
    const d = new Date(t.date);
    const shiftedDate = new Date(d.getTime() + shift.diffMs);
    return {
      ...t,
      date: typeof t.date === 'string' ? shiftedDate.toISOString() : shiftedDate
    };
  });

  const shiftedEvents = calendarEvents.map(e => {
    if (!e || !e.start) return e;
    const eventDate = getLocalDateString(e.start, timezone);
    const shift = getShiftInfo(eventDate);
    if (!shift) return e;
    
    const dStart = new Date(e.start);
    const shiftedStart = new Date(dStart.getTime() + shift.diffMs);
    
    let shiftedEnd = e.end;
    if (e.end) {
      const dEnd = new Date(e.end);
      shiftedEnd = new Date(dEnd.getTime() + shift.diffMs);
    }
    
    return {
      ...e,
      start: typeof e.start === 'string' ? shiftedStart.toISOString() : shiftedStart,
      end: typeof e.end === 'string' ? (shiftedEnd as Date).toISOString() : shiftedEnd
    };
  });

  const shiftedAccomplishments = accomplishments.map(a => {
    if (!a || !a.date) return a;
    const shift = getShiftInfo(a.date);
    if (!shift) return a;
    
    return {
      ...a,
      date: shift.nearest
    };
  });

  return {
    tasks: shiftedTasks,
    accomplishments: shiftedAccomplishments,
    calendarEvents: shiftedEvents
  };
}

