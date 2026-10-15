import { describe, expect, it } from 'vitest';
import {
  getTaskElapsed,
  formatElapsedMinutes,
  initialScheduleSlots,
  validateScheduleSlots,
} from '@/lib/taskElapsed';
import { calculateOccupiedHoursForDay } from '@/lib/analyticsUtils';

// Asia/Kolkata (UTC+5:30, no DST) makes any UTC-vs-local slip obvious.
const TZ = 'Asia/Kolkata';
const at = (local: string) => new Date(`${local}:00+05:30`); // '2026-10-15T10:30'
const slot = (taskId: string, start: string, end: string, completed = false) => ({
  taskId,
  start: at(start).toISOString(),
  end: at(end).toISOString(),
  completed,
});
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  status: 'PENDING',
  date: at('2026-10-15T00:00').toISOString(),
  actualTime: 0,
  ...over,
});

describe('getTaskElapsed - before, during, after', () => {
  const events = [slot('t1', '2026-10-15T10:00', '2026-10-15T12:00')];

  it('is zero and not-started before the scheduled start', () => {
    expect(getTaskElapsed(task(), events, TZ, at('2026-10-15T09:59'))).toEqual({ state: 'not-started', minutes: 0 });
  });

  it('counts from the scheduled start while ongoing, without completion', () => {
    expect(getTaskElapsed(task(), events, TZ, at('2026-10-15T10:45'))).toEqual({ state: 'ongoing', minutes: 45 });
  });

  it('caps at the scheduled end once the slot is over', () => {
    expect(getTaskElapsed(task(), events, TZ, at('2026-10-15T15:00'))).toEqual({ state: 'ended', minutes: 120 });
  });

  it('works from the task’s own start/end when there are no calendar slots', () => {
    const t = task({ startTime: '10:00', endTime: '11:00' });
    expect(getTaskElapsed(t, [], TZ, at('2026-10-15T10:20')).minutes).toBe(20);
  });

  it('handles a slot that crosses midnight', () => {
    const t = task({ startTime: '23:30', endTime: '00:30' });
    expect(getTaskElapsed(t, [], TZ, at('2026-10-16T00:10')).minutes).toBe(40);
  });

  it('reports unscheduled for a task with no schedule', () => {
    expect(getTaskElapsed(task(), [], TZ, at('2026-10-15T10:00'))).toEqual({ state: 'unscheduled', minutes: 0 });
  });

  it('does not accrue on a blocked task', () => {
    expect(getTaskElapsed(task({ status: 'BLOCKED' }), events, TZ, at('2026-10-15T11:00')).minutes).toBe(0);
  });

  it('counts a ticked-off slot in full and only the elapsed part of an open one', () => {
    const multi = [
      slot('t1', '2026-10-15T09:00', '2026-10-15T10:00', true),
      slot('t1', '2026-10-15T14:00', '2026-10-15T15:00'),
    ];
    expect(getTaskElapsed(task(), multi, TZ, at('2026-10-15T14:15')).minutes).toBe(75);
  });

  it('ignores other tasks’ slots', () => {
    expect(getTaskElapsed(task(), [slot('other', '2026-10-15T08:00', '2026-10-15T09:00')], TZ, at('2026-10-15T12:00')).state).toBe('unscheduled');
  });
});

describe('getTaskElapsed - schedule edits and refresh', () => {
  const now = at('2026-10-15T10:30');

  it('recalculates from the new start time after an edit', () => {
    const before = [slot('t1', '2026-10-15T10:00', '2026-10-15T11:00')];
    const after = [slot('t1', '2026-10-15T10:15', '2026-10-15T11:00')];
    expect(getTaskElapsed(task(), before, TZ, now).minutes).toBe(30);
    expect(getTaskElapsed(task(), after, TZ, now).minutes).toBe(15);
  });

  it('drops back to zero when the start is moved into the future', () => {
    const moved = [slot('t1', '2026-10-15T13:00', '2026-10-15T14:00')];
    expect(getTaskElapsed(task(), moved, TZ, now)).toEqual({ state: 'not-started', minutes: 0 });
  });

  it('follows a shortened end time', () => {
    const shortened = [slot('t1', '2026-10-15T10:00', '2026-10-15T10:20')];
    expect(getTaskElapsed(task(), shortened, TZ, now)).toEqual({ state: 'ended', minutes: 20 });
  });

  it('is a pure function of saved data + clock: a "reload" gives the same value', () => {
    const events = [slot('t1', '2026-10-15T10:00', '2026-10-15T11:00')];
    const reloaded = JSON.parse(JSON.stringify({ t: task(), events }));
    expect(getTaskElapsed(reloaded.t, reloaded.events, TZ, now)).toEqual(getTaskElapsed(task(), events, TZ, now));
  });
});

describe('getTaskElapsed - completed tasks keep their history', () => {
  it('reports the recorded actualTime, not the clock', () => {
    const done = task({ status: 'COMPLETED', actualTime: 1.5 });
    const events = [slot('t1', '2026-10-15T10:00', '2026-10-15T11:30', true)];
    expect(getTaskElapsed(done, events, TZ, at('2026-10-20T10:00'))).toEqual({ state: 'completed', minutes: 90 });
  });

  it('falls back to the slots only when no time was recorded', () => {
    const done = task({ status: 'COMPLETED', actualTime: 0, startTime: '10:00', endTime: '10:45' });
    expect(getTaskElapsed(done, [], TZ, at('2026-10-15T23:00')).minutes).toBe(45);
  });
});

describe('calculateOccupiedHoursForDay with `now`', () => {
  const tasks = [task({ sessionType: 'REGULAR' })];
  const events = [slot('t1', '2026-10-15T10:00', '2026-10-15T12:00')];

  it('counts open work under way only when asked (dashboard), never in stored history', () => {
    expect(calculateOccupiedHoursForDay('2026-10-15', tasks, events, TZ)).toBe(0);
    expect(calculateOccupiedHoursForDay('2026-10-15', tasks, events, TZ, undefined, at('2026-10-15T11:00'))).toBeCloseTo(1);
  });

  it('is zero before the start and capped at the end', () => {
    expect(calculateOccupiedHoursForDay('2026-10-15', tasks, events, TZ, undefined, at('2026-10-15T09:00'))).toBe(0);
    expect(calculateOccupiedHoursForDay('2026-10-15', tasks, events, TZ, undefined, at('2026-10-15T18:00'))).toBeCloseTo(2);
  });

  it('does not double-count a completed task', () => {
    const done = [task({ status: 'COMPLETED', sessionType: 'REGULAR' })];
    const doneEvents = [slot('t1', '2026-10-15T10:00', '2026-10-15T12:00', true)];
    expect(calculateOccupiedHoursForDay('2026-10-15', done, doneEvents, TZ, undefined, at('2026-10-15T18:00'))).toBeCloseTo(2);
  });

  it('respects the session-type filter', () => {
    expect(calculateOccupiedHoursForDay('2026-10-15', tasks, events, TZ, ['DEEP_WORK'], at('2026-10-15T11:00'))).toBe(0);
  });
});

describe('initialScheduleSlots - Up next never inherits another task’s schedule', () => {
  const toLocal = (d: string | Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
  const events = [slot('a', '2026-10-15T10:00', '2026-10-15T11:00')];

  it('loads a scheduled task’s own slots for editing', () => {
    expect(initialScheduleSlots({ id: 'a' }, events, toLocal)).toEqual([{ startTime: '10:00', endTime: '11:00' }]);
  });

  it('starts empty for an unscheduled task, even right after a scheduled one', () => {
    const first = initialScheduleSlots({ id: 'a' }, events, toLocal);
    const second = initialScheduleSlots({ id: 'b' }, events, toLocal);
    const third = initialScheduleSlots({ id: 'c' }, events, toLocal);
    expect(first[0].startTime).toBe('10:00');
    expect(second).toEqual([{ startTime: '', endTime: '' }]);
    expect(third).toEqual([{ startTime: '', endTime: '' }]);
  });

  it('uses the task’s own start/end when it has no calendar slots', () => {
    expect(initialScheduleSlots({ id: 'b', startTime: '14:00', endTime: '15:00' }, events, toLocal)).toEqual([{ startTime: '14:00', endTime: '15:00' }]);
  });
});

describe('validateScheduleSlots', () => {
  it('rejects an empty schedule', () => {
    expect(validateScheduleSlots([{ startTime: '', endTime: '' }])).toMatch(/Pick a start and end/);
  });
  it('rejects a slot with only one end', () => {
    expect(validateScheduleSlots([{ startTime: '10:00', endTime: '' }])).toMatch(/slot 1 needs both/);
    expect(validateScheduleSlots([{ startTime: '10:00', endTime: '11:00' }, { startTime: '', endTime: '12:00' }])).toMatch(/slot 2/);
  });
  it('accepts a complete schedule', () => {
    expect(validateScheduleSlots([{ startTime: '10:00', endTime: '11:00' }])).toBeNull();
  });
});

describe('formatElapsedMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsedMinutes(45)).toBe('45m');
    expect(formatElapsedMinutes(65)).toBe('1h05m');
    expect(formatElapsedMinutes(-3)).toBe('0m');
  });
});

describe('daily worked time - attributed to the day work STARTS (overnight work)', () => {
  // A task's slot (calendar event) is anchored on the task's date, so an
  // overnight slot starts on that date and ends on the next.
  const task16 = (over: Record<string, unknown> = {}) =>
    task({ id: 't16', date: at('2026-10-16T00:00').toISOString(), sessionType: 'REGULAR', ...over });
  const task17 = (over: Record<string, unknown> = {}) =>
    task({ id: 't17', date: at('2026-10-17T00:00').toISOString(), sessionType: 'REGULAR', ...over });
  const day = (d: string, tasks: unknown[], events: unknown[], now: Date) =>
    calculateOccupiedHoursForDay(d, tasks as never[], events as never[], TZ, undefined, now);

  it('starts 16 Oct 23:30, now 17 Oct 01:00 -> 1h30 on the 16th, nothing on the 17th', () => {
    const events = [slot('t16', '2026-10-16T23:30', '2026-10-17T02:00')];
    const now = at('2026-10-17T01:00');
    expect(day('2026-10-16', [task16()], events, now)).toBeCloseTo(1.5);
    expect(day('2026-10-17', [task16()], events, now)).toBe(0);
    expect(getTaskElapsed(task16(), events, TZ, now)).toEqual({ state: 'ongoing', minutes: 90 });
  });

  it('starts 17 Oct 00:15, now 01:00 -> 45m on the 17th', () => {
    const events = [slot('t17', '2026-10-17T00:15', '2026-10-17T02:00')];
    const now = at('2026-10-17T01:00');
    expect(day('2026-10-17', [task17()], events, now)).toBeCloseTo(0.75);
    expect(day('2026-10-16', [task17()], events, now)).toBe(0);
  });

  it('starts 21:00 and finishes 22:00 on the 16th -> 1h on the 16th', () => {
    const done = task16({ status: 'COMPLETED', actualTime: 1 });
    const events = [slot('t16', '2026-10-16T21:00', '2026-10-16T22:00', true)];
    expect(day('2026-10-16', [done], events, at('2026-10-17T09:00'))).toBeCloseTo(1);
  });

  it('completing an overnight task keeps it on its start day with its full duration', () => {
    const done = task16({ status: 'COMPLETED', actualTime: 2 });
    const events = [slot('t16', '2026-10-16T23:30', '2026-10-17T01:30', true)];
    const later = at('2026-10-18T12:00');
    expect(day('2026-10-16', [done], events, later)).toBeCloseTo(2);
    expect(day('2026-10-17', [done], events, later)).toBe(0);
    expect(getTaskElapsed(done, events, TZ, later)).toEqual({ state: 'completed', minutes: 120 });
  });

  it('a completed task with no slot but its own overnight start/end stays on its date', () => {
    const done = task16({ status: 'COMPLETED', actualTime: 1.5, startTime: '23:30', endTime: '01:00' });
    expect(day('2026-10-16', [done], [], at('2026-10-17T09:00'))).toBeCloseTo(1.5);
    expect(day('2026-10-17', [done], [], at('2026-10-17T09:00'))).toBe(0);
  });

  it('an overnight slot that ended after midnight still counts on its start day once over', () => {
    const events = [slot('t16', '2026-10-16T23:30', '2026-10-17T00:30')];
    expect(day('2026-10-16', [task16()], events, at('2026-10-17T03:00'))).toBeCloseTo(1);
  });

  it('an unticked slot from an earlier day stays uncounted (no silent history)', () => {
    const events = [slot('t16', '2026-10-16T10:00', '2026-10-16T11:00')];
    expect(day('2026-10-16', [task16()], events, at('2026-10-17T09:00'))).toBe(0);
    expect(getTaskElapsed(task16(), events, TZ, at('2026-10-17T09:00')).minutes).toBe(0);
  });

  it('switching between dates gives each date its own total, every time', () => {
    const tasks = [task16(), task17({ status: 'COMPLETED', actualTime: 1 })];
    const events = [
      slot('t16', '2026-10-16T23:30', '2026-10-17T02:00'),
      slot('t17', '2026-10-17T09:00', '2026-10-17T10:00', true),
    ];
    const now = at('2026-10-17T12:00');
    const seq = ['2026-10-16', '2026-10-17', '2026-10-15', '2026-10-16', '2026-10-17'].map((d) => day(d, tasks, events, now));
    expect(seq[0]).toBeCloseTo(2.5);
    expect(seq[1]).toBeCloseTo(1);
    expect(seq[2]).toBe(0);
    expect(seq[3]).toBe(seq[0]);
    expect(seq[4]).toBe(seq[1]);
  });

  it('a reload mid-overnight gives the same elapsed time (pure function of stored data + clock)', () => {
    const events = [slot('t16', '2026-10-16T23:30', '2026-10-17T02:00')];
    const now = at('2026-10-17T00:45');
    const stored = JSON.parse(JSON.stringify({ t: task16(), events }));
    expect(day('2026-10-16', [stored.t], stored.events, now)).toBeCloseTo(1.25);
    expect(getTaskElapsed(stored.t, stored.events, TZ, now).minutes).toBe(75);
  });

  it('time-zone boundaries: the same instants attribute by the account zone', () => {
    // 03:30 UTC on the 17th is 23:30 on the 16th in New York.
    const ny = 'America/New_York';
    const t = { id: 'n', status: 'PENDING', date: '2026-10-16T04:00:00.000Z', sessionType: 'REGULAR' };
    const ev = [{ taskId: 'n', start: '2026-10-17T03:30:00.000Z', end: '2026-10-17T06:00:00.000Z', completed: false }];
    const now = new Date('2026-10-17T05:00:00.000Z'); // 01:00 in New York
    expect(calculateOccupiedHoursForDay('2026-10-16', [t], ev, ny, undefined, now)).toBeCloseTo(1.5);
    expect(calculateOccupiedHoursForDay('2026-10-17', [t], ev, ny, undefined, now)).toBe(0);
  });
});
