import { describe, it, expect } from 'vitest';
import { monthGrid, shiftMonth, addDays, monthOf, groupTasksByDay, plannedHours } from '@/app/tasks/taskCalendar';

describe('monthGrid', () => {
  it('starts on Monday and pads with the neighbouring months', () => {
    const weeks = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
    expect(weeks[0][0]).toEqual({ key: '2026-10-26', day: 26, inMonth: false });
    expect(weeks[0][6]).toEqual({ key: '2026-11-01', day: 1, inMonth: true });
    expect(weeks.at(-1)!.at(-1)!.key).toBe('2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('draws only the weeks a month needs', () => {
    expect(monthGrid('2027-02')).toHaveLength(4); // Mon 1 Feb - Sun 28 Feb 2027
    expect(monthGrid('2026-06')).toHaveLength(5);
  });

  it('handles leap years', () => {
    const days = monthGrid('2028-02').flat().filter((d) => d.inMonth);
    expect(days).toHaveLength(29);
  });
});

describe('date steps', () => {
  it('moves across month and year ends', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthOf('2026-11-02')).toBe('2026-11');
  });
});

describe('groupTasksByDay', () => {
  const TZ = 'UTC';
  const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, date: '2026-11-02T00:00:00Z', status: 'PENDING', priority: 'MEDIUM', estimatedTime: 1, ...extra });

  it('puts each task on its scheduled day in the user\'s time zone', () => {
    const late = task('late', { date: '2026-11-02T23:30:00Z' });
    expect(Object.keys(groupTasksByDay([late], [], 'UTC'))).toEqual(['2026-11-02']);
    expect(Object.keys(groupTasksByDay([late], [], 'Asia/Kolkata'))).toEqual(['2026-11-03']);
  });

  it('orders a day: timed by start, then untimed by priority, done last', () => {
    const tasks = [
      task('done', { status: 'COMPLETED', startTime: '07:00', endTime: '08:00' }),
      task('low', { priority: 'LOW' }),
      task('crit', { priority: 'CRITICAL' }),
      task('at10', { startTime: '10:00', endTime: '11:00' }),
      task('at9'),
    ];
    const events = [{ taskId: 'at9', start: '2026-11-02T09:00:00Z', end: '2026-11-02T09:30:00Z' }];
    const day = groupTasksByDay(tasks, events, TZ)['2026-11-02'];
    expect(day.map((e) => e.task.id)).toEqual(['at9', 'at10', 'crit', 'low', 'done']);
    expect(day[0].start?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(day[2].start).toBeNull();
  });

  it('sums planned hours', () => {
    expect(plannedHours([task('a', { estimatedTime: 1.5 }), task('b', { estimatedTime: 0.25 }), task('c', { estimatedTime: null })].map((t) => ({ task: t })))).toBe(1.8);
  });
});
