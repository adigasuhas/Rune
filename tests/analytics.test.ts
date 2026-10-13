import { describe, it, expect } from 'vitest';
import { calculateProductivityScore, hasAnyActivity, calculateWorkingDayMetrics } from '@/lib/analyticsUtils';

describe('calculateProductivityScore', () => {
  it('a completely inactive day scores 0 (no "you showed up" base points)', () => {
    expect(calculateProductivityScore({ completionRate: 0, deepWorkHours: 0, workHours: 0, postponeCount: 0 })).toBe(0);
  });

  it('a full day scores near 100', () => {
    const s = calculateProductivityScore({ completionRate: 100, deepWorkHours: 4, workHours: 8, postponeCount: 0 });
    expect(s).toBeGreaterThanOrEqual(95);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('rescheduling is not penalised (postponeCount has no effect)', () => {
    const base = calculateProductivityScore({ completionRate: 100, deepWorkHours: 0, workHours: 0, postponeCount: 0 });
    const withPostpones = calculateProductivityScore({ completionRate: 100, deepWorkHours: 0, workHours: 0, postponeCount: 10 });
    expect(withPostpones).toBe(base);
  });

  it('a good-not-perfect day lands around 75', () => {
    const s = calculateProductivityScore({ completionRate: 80, deepWorkHours: 3, workHours: 6 });
    expect(s).toBeGreaterThanOrEqual(70);
    expect(s).toBeLessThanOrEqual(80);
  });

  it('is clamped to 0..100', () => {
    expect(calculateProductivityScore({ completionRate: 100, deepWorkHours: 99, workHours: 99, postponeCount: 0 })).toBeLessThanOrEqual(100);
    expect(calculateProductivityScore({ completionRate: 0, deepWorkHours: 0, workHours: 0, postponeCount: 99 })).toBe(0);
  });
});

describe('hasAnyActivity', () => {
  it('false when nothing happened', () => {
    expect(hasAnyActivity({ completionRate: 0, deepWorkHours: 0, workHours: 0, tasksPlanned: 0 })).toBe(false);
  });
  it('true when a task is merely planned', () => {
    expect(hasAnyActivity({ completionRate: 0, deepWorkHours: 0, workHours: 0, tasksPlanned: 2 })).toBe(true);
  });
});

describe('completion rate excludes BLOCKED tasks', () => {
  const day = '2026-08-24';
  const mk = (id: string, status: string) => ({ id, status, date: `${day}T10:00:00.000Z`, sessionType: 'REGULAR', estimatedTime: 1 });

  it('a blocked task is not counted against you', () => {
    // 1 done, 1 blocked -> rate is 100% (blocked excluded), not 50%
    const m = calculateWorkingDayMetrics(
      [day],
      [mk('a', 'COMPLETED'), mk('b', 'BLOCKED')],
      [],
      [],
      'UTC'
    );
    expect(m.completionRate).toBe(100);
  });

  it('a normal open task still counts', () => {
    const m = calculateWorkingDayMetrics(
      [day],
      [mk('a', 'COMPLETED'), mk('b', 'PENDING')],
      [],
      [],
      'UTC'
    );
    expect(m.completionRate).toBe(50);
  });
});
