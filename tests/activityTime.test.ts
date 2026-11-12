import { describe, it, expect } from 'vitest';
import { accountDay, awayCovers, findOverlap, formatDuration, mergeSpans, overlapMs, sessionsOnDay, sessionSpan } from '@/lib/activityTime';
import { calculateOccupiedHoursForDay, subtractIntervals } from '@/lib/analyticsUtils';

const at = (hhmm: string, day = '2026-11-10') => new Date(`${day}T${hhmm}:00Z`);
const MIN = 60_000;

describe('activity time accounting', () => {
  it('cuts a break out of the work slot it falls in, and Active = Working + Break + Drain', () => {
    const work = [{ start: at('09:00'), end: at('11:00') }];
    const sessions = [
      { kind: 'BREAK', start: at('10:00'), end: at('10:15') },
      { kind: 'BRAIN_DRAIN', start: at('10:30'), end: at('10:40') },
    ];
    const a = accountDay(work, sessions, at('20:00'));
    expect(a.workingMs).toBe(95 * MIN);
    expect(a.breakMs).toBe(15 * MIN);
    expect(a.drainMs).toBe(10 * MIN);
    expect(a.activeMs).toBe(a.workingMs + a.breakMs + a.drainMs);
    expect(a.activeMs).toBe(120 * MIN);
  });

  it('counts a break outside work as active time, never as working time', () => {
    const a = accountDay([{ start: at('09:00'), end: at('10:00') }], [{ kind: 'BREAK', start: at('12:00'), end: at('12:30') }], at('20:00'));
    expect(a.workingMs).toBe(60 * MIN);
    expect(a.activeMs).toBe(90 * MIN);
  });

  it('never counts overlapping sessions twice: a stretch logged as both is a break', () => {
    const sessions = [
      { kind: 'BREAK', start: at('10:00'), end: at('10:30') },
      { kind: 'BREAK', start: at('10:20'), end: at('10:40') },
      { kind: 'BRAIN_DRAIN', start: at('10:35'), end: at('11:00') },
    ];
    const a = accountDay([], sessions, at('20:00'));
    expect(a.breakMs).toBe(40 * MIN);
    expect(a.drainMs).toBe(20 * MIN);
    expect(a.activeMs).toBe(60 * MIN);
  });

  it('counts a forgotten running session for at most 4 hours until it is stopped', async () => {
    const { isLongRunning, RUNNING_COUNT_CAP_MS } = await import('@/lib/activityTime');
    const running = { kind: 'BREAK', start: at('08:00'), end: null };
    expect(sessionSpan(running, at('20:00'))).toEqual({ start: at('08:00'), end: new Date(at('08:00').getTime() + RUNNING_COUNT_CAP_MS) });
    expect(isLongRunning(running, at('09:59'))).toBe(false);
    expect(isLongRunning(running, at('10:00'))).toBe(true);
    // Once stopped, the recorded times count in full.
    expect(sessionSpan({ ...running, end: at('15:00') }, at('20:00'))?.end).toEqual(at('15:00'));
  });

  it('runs an unfinished session up to now', () => {
    expect(sessionSpan({ kind: 'BREAK', start: at('10:00'), end: null }, at('10:25'))).toEqual({ start: at('10:00'), end: at('10:25') });
    expect(sessionSpan({ kind: 'BREAK', start: at('10:00'), end: null }, at('09:00'))).toBeNull();
  });

  it('keeps a session that runs past midnight on the day it started', () => {
    const s = [{ kind: 'BREAK', start: at('23:40'), end: at('00:20', '2026-11-11') }];
    expect(sessionsOnDay(s, '2026-11-10', 'UTC')).toHaveLength(1);
    expect(sessionsOnDay(s, '2026-11-11', 'UTC')).toHaveLength(0);
    expect(accountDay([], s, at('12:00', '2026-11-11')).breakMs).toBe(40 * MIN);
  });

  it('still cuts work that a session from the night before overlaps', () => {
    const late = [{ kind: 'BREAK', start: at('23:40'), end: at('00:20', '2026-11-11') }];
    const a = accountDay([{ start: at('00:00', '2026-11-11'), end: at('01:00', '2026-11-11') }], [], at('12:00', '2026-11-11'), late);
    expect(a.workingMs).toBe(40 * MIN);
    expect(a.breakMs).toBe(0);
  });

  it('finds overlaps with other sessions, including a running one', () => {
    const sessions = [
      { id: 'a', kind: 'BREAK', start: at('10:00'), end: at('10:30') },
      { id: 'b', kind: 'BRAIN_DRAIN', start: at('11:00'), end: null },
    ];
    expect(findOverlap(at('10:15'), at('10:45'), sessions, at('12:00'))?.id).toBe('a');
    expect(findOverlap(at('10:30'), at('11:00'), sessions, at('12:00'))).toBeNull();
    expect(findOverlap(at('11:30'), at('11:40'), sessions, at('12:00'))?.id).toBe('b');
    expect(findOverlap(at('10:15'), at('10:20'), sessions, at('12:00'), 'a')).toBeNull();
  });

  it('merges, overlaps and subtracts intervals', () => {
    expect(mergeSpans([{ start: at('10:00'), end: at('11:00') }, { start: at('10:30'), end: at('12:00') }])).toEqual([{ start: at('10:00'), end: at('12:00') }]);
    expect(overlapMs([{ start: at('10:00'), end: at('12:00') }], [{ start: at('11:00'), end: at('13:00') }])).toBe(60 * MIN);
    const cut = subtractIntervals([{ start: at('09:00'), end: at('12:00'), taskId: 't' }], [{ start: at('10:00'), end: at('10:30') }]);
    expect(cut.map(c => [c.start.toISOString(), c.end.toISOString(), c.taskId])).toEqual([
      [at('09:00').toISOString(), at('10:00').toISOString(), 't'],
      [at('10:30').toISOString(), at('12:00').toISOString(), 't'],
    ]);
    expect(awayCovers([{ kind: 'BRAIN_DRAIN', start: at('10:00'), end: at('10:30') }]).drain).toHaveLength(1);
  });

  it('takes breaks out of hours worked in Analytics when given', () => {
    const tasks = [{ id: 't', status: 'COMPLETED', date: '2026-11-10T00:00:00Z', sessionType: 'REGULAR', actualTime: 2 }];
    const events = [{ taskId: 't', start: at('09:00'), end: at('11:00'), completed: true, sessionType: 'REGULAR' }];
    expect(calculateOccupiedHoursForDay('2026-11-10', tasks, events, 'UTC')).toBe(2);
    expect(calculateOccupiedHoursForDay('2026-11-10', tasks, events, 'UTC', undefined, undefined, [{ start: at('10:00'), end: at('10:30') }])).toBe(1.5);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(25 * MIN)).toBe('25m');
    expect(formatDuration(65 * MIN)).toBe('1h 05m');
  });
});

describe('accountDays', () => {
  it('builds each day from tasks, slots and sessions', async () => {
    const { accountDays } = await import('@/lib/activityTime');
    const tasks = [{ id: 't', status: 'COMPLETED', date: '2026-11-10T00:00:00Z', sessionType: 'REGULAR' }];
    const events = [{ taskId: 't', start: at('09:00'), end: at('11:00'), completed: true, sessionType: 'REGULAR' }];
    const sessions = [{ kind: 'BREAK', start: at('10:00'), end: at('10:30') }, { kind: 'BRAIN_DRAIN', start: at('14:00'), end: at('14:20') }];
    const m = accountDays(['2026-11-10', '2026-11-11'], tasks, events, sessions, 'UTC', at('20:00', '2026-11-11'));
    expect(m.get('2026-11-10')).toMatchObject({ workingMs: 90 * MIN, breakMs: 30 * MIN, drainMs: 20 * MIN, activeMs: 140 * MIN });
    expect(m.get('2026-11-11')?.activeMs).toBe(0);
  });
});
