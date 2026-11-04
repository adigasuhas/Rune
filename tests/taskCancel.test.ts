import { describe, it, expect } from 'vitest';
import { cleanCancelReason, withoutCancelled, isCancelled, CANCEL_REASON_MAX } from '@/lib/taskCancel';
import { countByStatusTab } from '@/app/tasks/taskHelpers';
import { slotDraftHours } from '@/lib/taskElapsed';
import { calculateWorkingDayMetrics } from '@/lib/analyticsUtils';

describe('cancelled tasks', () => {
  const tasks = [
    { id: 'a', status: 'PENDING' },
    { id: 'b', status: 'CANCELLED' },
    { id: 'c', status: 'COMPLETED' },
  ];

  it('leave every plan and count', () => {
    expect(withoutCancelled(tasks).map((t) => t.id)).toEqual(['a', 'c']);
    expect(isCancelled(tasks[1])).toBe(true);
    const counts = countByStatusTab(tasks, 0, 1);
    expect(counts.ALL).toBe(2);
    expect(counts.CANCELLED).toBe(1);
  });

  it('a reason is trimmed, single-spaced and capped; blank is no reason', () => {
    expect(cleanCancelReason('  Plans \n changed ')).toBe('Plans changed');
    expect(cleanCancelReason('   ')).toBeNull();
    expect(cleanCancelReason(42)).toBeNull();
    expect(cleanCancelReason('x'.repeat(900))).toHaveLength(CANCEL_REASON_MAX);
  });

  it("don't count against the completion rate", () => {
    const day = '2026-11-03';
    const date = new Date(`${day}T06:00:00Z`).toISOString();
    const m = calculateWorkingDayMetrics([day], [
      { id: '1', status: 'COMPLETED', date },
      { id: '2', status: 'CANCELLED', date },
    ] as never[], [], [], 'UTC');
    expect(m.completionRate).toBe(100);
  });
});

describe('planned time follows the slots', () => {
  it('adds up the slots, overnight ones included', () => {
    expect(slotDraftHours([{ startTime: '09:00', endTime: '11:30' }, { startTime: '14:00', endTime: '14:45' }])).toBe(3.25);
    expect(slotDraftHours([{ startTime: '23:00', endTime: '01:00' }])).toBe(2);
    expect(slotDraftHours([{ startTime: '09:00', endTime: '' }])).toBe(0);
  });
});

describe('averages count only days that are over', () => {
  it('today waits until it is reviewed (or has passed)', async () => {
    const { settledDays } = await import('@/lib/analyticsUtils');
    const days = ['2026-11-02', '2026-11-03', '2026-11-04'];
    expect(settledDays(days, '2026-11-04', false)).toEqual(['2026-11-02', '2026-11-03']);
    expect(settledDays(days, '2026-11-04', true)).toEqual(days);
    // The next morning, yesterday counts whether or not it was reviewed.
    expect(settledDays(days, '2026-11-05', false)).toEqual(days);
  });
});
