import { getLocalDateString, getCurrentDateInTimezone } from '@/lib/dateUtils';

export type TimeSlot = { startTime: string; endTime: string };

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Formats an ISO datetime string as "HH:MM" in the given timezone, falling back to the machine's local time zone and then a fixed default if `Intl` formatting fails. */
export function getTimeInTimezone(dateIsoStr: string, timezone: string): string {
  try {
    const d = new Date(dateIsoStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    const hrs = String(parts.find(p => p.type === 'hour')?.value).padStart(2, '0');
    const mins = String(parts.find(p => p.type === 'minute')?.value).padStart(2, '0');
    return `${hrs}:${mins}`;
  } catch {
    try {
      const d = new Date(dateIsoStr);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '09:00';
    }
  }
}

/** Hour-of-day (0-23) an ISO datetime string falls on in the given timezone. */
export function getHourInTimezone(dateIsoStr: string, timezone: string, fallbackVal: number = 0): number {
  try {
    const d = new Date(dateIsoStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    return Number(parts.find(p => p.type === 'hour')?.value);
  } catch {
    try {
      return new Date(dateIsoStr).getHours();
    } catch {
      return fallbackVal;
    }
  }
}

/** Checks a set of same-day time slots for blank times and internal overlaps; returns a user-facing error string, or null if the slots are all valid. */
export function validateInternalSlots(slots: TimeSlot[]): string | null {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.startTime || !s.endTime) {
      return `Slot ${i + 1} has empty start or end time.`;
    }
    if (s.startTime === s.endTime) {
      return `Slot ${i + 1} start time cannot be equal to end time.`;
    }
  }

  for (let i = 0; i < slots.length; i++) {
    const s1 = slots[i];
    const start1 = toMinutes(s1.startTime);
    let end1 = toMinutes(s1.endTime);
    if (end1 <= start1) end1 += 24 * 60;

    for (let j = i + 1; j < slots.length; j++) {
      const s2 = slots[j];
      const start2 = toMinutes(s2.startTime);
      let end2 = toMinutes(s2.endTime);
      if (end2 <= start2) end2 += 24 * 60;

      if (start1 < end2 && start2 < end1) {
        return `Overlapping slots detected: ${s1.startTime}-${s1.endTime} and ${s2.startTime}-${s2.endTime}.`;
      }
    }
  }
  return null;
}

export interface OverlapEvent {
  title: string;
  start: string;
  end: string;
  taskId?: string | null;
}

export interface OverlapConflict {
  title: string;
  startStr: string;
  endStr: string;
}

/** Which of the given slots (on `dateStr`, in `timezone`) collide with an already-booked calendar event, excluding `excludeTaskId`'s own events (so editing a task doesn't flag its own slots as conflicts). */
export function getOverlaps(
  slots: TimeSlot[],
  dateStr: string,
  events: OverlapEvent[],
  timezone: string,
  excludeTaskId?: string | null
): OverlapConflict[] {
  const bookedEvents = events.filter(e => {
    if (excludeTaskId && e.taskId === excludeTaskId) return false;
    const eventDate = getLocalDateString(e.start, timezone);
    return eventDate === dateStr;
  });

  const conflictingEvents: OverlapConflict[] = [];

  for (const slot of slots) {
    if (!slot.startTime || !slot.endTime) continue;
    const startMins = toMinutes(slot.startTime);
    let endMins = toMinutes(slot.endTime);
    if (endMins <= startMins) endMins += 24 * 60;

    for (const evt of bookedEvents) {
      const evtStartStr = getTimeInTimezone(evt.start, timezone);
      const evtEndStr = getTimeInTimezone(evt.end, timezone);

      const evtStartMins = toMinutes(evtStartStr);
      let evtEndMins = toMinutes(evtEndStr);

      const evtStartDate = getLocalDateString(evt.start, timezone);
      const evtEndDate = getLocalDateString(evt.end, timezone);
      if (evtStartDate !== evtEndDate) {
        evtEndMins += 24 * 60;
      }

      if (startMins < evtEndMins && evtStartMins < endMins) {
        if (!conflictingEvents.some(item => item.title === evt.title && item.startStr === evtStartStr && item.endStr === evtEndStr)) {
          conflictingEvents.push({
            title: evt.title,
            startStr: evtStartStr,
            endStr: evtEndStr
          });
        }
      }
    }
  }
  return conflictingEvents;
}

// A Date anchored at noon UTC of "today" in the given timezone. Noon UTC is
// safely inside the same calendar day for every named timezone, so walking
// this anchor with setUTCDate(...) gives stable calendar-day arithmetic that
// can't drift a day off when later re-formatted with getLocalDateString(d,
// timezone) - unlike center.getDate()/setDate(), which operate on the
// browser's own local day and silently disagree with the account's saved
// timezone whenever they differ (this was the root cause of the mini
// calendar's "today" pill landing on a different day than the header clock,
// and of freshly-created tasks not showing up under any date filter).
export function anchorForToday(timezone: string): Date {
  return new Date(`${getCurrentDateInTimezone(timezone)}T12:00:00Z`);
}

export type StatusTab = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'POSTPONED';

/**
 * Tasks scheduled on `dateKey` (YYYY-MM-DD in the account's timezone), by
 * their scheduled `date` - never createdAt or a deadline. A null dateKey
 * ("Clear" in the date rail) keeps every task.
 */
export function tasksOnDate<T extends { date: string | Date | null }>(tasks: T[], dateKey: string | null, timezone: string): T[] {
  if (!dateKey) return tasks;
  return tasks.filter((t) => getLocalDateString(t.date, timezone) === dateKey);
}

/**
 * The number on each status tab, counted from the same set the list shows,
 * so a tab's number always equals the rows it reveals. "Postponed" counts
 * every task that was ever pushed back, in any state - the Postponed tab
 * lists them across all its sections.
 */
export function countByStatusTab<T extends { status: string }>(tasks: T[], postponeCount: (t: T) => number): Record<StatusTab, number> {
  const counts: Record<StatusTab, number> = { ALL: tasks.length, PENDING: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0, POSTPONED: 0 };
  for (const t of tasks) {
    if (t.status in counts && t.status !== 'ALL' && t.status !== 'POSTPONED') counts[t.status as StatusTab]++;
    if (postponeCount(t) > 0) counts.POSTPONED++;
  }
  return counts;
}
