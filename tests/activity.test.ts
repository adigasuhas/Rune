import { describe, expect, it } from 'vitest';
import { dailyActivity, formatHours, levelFor, rangeStart, summarize } from '@/lib/activity';

const TZ = 'UTC';
const done = (date: string, s: string, e: string) => ({ date: `${date}T09:00:00Z`, status: 'COMPLETED', startTime: s, endTime: e, actualTime: 0 });

describe('activity', () => {
  it('bands hours into neutral levels', () => {
    expect([0, 0.5, 2, 4, 7].map(levelFor)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts worked time per day, overlaps once, and completions as context', () => {
    const tasks = [done('2026-03-02', '09:00', '11:00'), done('2026-03-02', '10:00', '12:00'), { date: '2026-03-02T09:00:00Z', status: 'PENDING' }];
    const events = [{ start: '2026-03-03T14:00:00Z', end: '2026-03-03T15:30:00Z', completed: true, sessionType: 'DEEP_WORK' }];
    const days = dailyActivity(tasks, events, TZ, '2026-03-01', '2026-03-04');
    expect(days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']);
    expect(days[1]).toMatchObject({ hours: 3, completed: 2, level: 2 });
    expect(days[2]).toMatchObject({ hours: 1.5, completed: 0, level: 2 });
    expect(days[0].level).toBe(0);
  });

  it('aligns ranges to Mondays and formats durations', () => {
    expect(new Date(rangeStart('2026-10-07', 2) + 'T12:00:00Z').getUTCDay()).toBe(1);
    expect(formatHours(4.5333)).toBe('4h 32m');
    expect(formatHours(2)).toBe('2h');
    expect(formatHours(0.25)).toBe('15m');
  });

  it('summarizes without judging', () => {
    const tasks = [
      done('2026-03-02', '09:00', '15:00'), done('2026-03-09', '09:00', '15:00'), done('2026-03-16', '09:00', '15:00'),
      done('2026-04-07', '09:00', '10:00'),
    ];
    const s = summarize(dailyActivity(tasks, [], TZ, '2026-03-01', '2026-04-30'));
    expect(s.daysWorked).toBe(4);
    expect(s.busiestMonth?.name).toBe('March');
    expect(s.longestWeekday).toBe('Mondays');
    expect(s.lines.join(' ')).not.toMatch(/bad|unproductive|fail|lazy/i);
  });
});
