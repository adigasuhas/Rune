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
