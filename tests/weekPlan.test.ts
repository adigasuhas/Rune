import { describe, it, expect } from 'vitest';
import { hasPlannedDaysAhead } from '@/lib/weekPlan';

const tz = 'UTC';
const today = '2026-11-09'; // a Monday

describe('Plan the week note', () => {
  it('counts the week as planned when a coming day has a task', () => {
    expect(hasPlannedDaysAhead(today, [{ date: '2026-11-11T00:00:00.000Z', status: 'PENDING' }], [], tz)).toBe(true);
  });

  it('counts a calendar event on a coming day', () => {
    expect(hasPlannedDaysAhead(today, [], [{ start: '2026-11-12T09:00:00.000Z' }], tz)).toBe(true);
  });

  it('is unplanned when only today (or the past) has anything', () => {
    expect(hasPlannedDaysAhead(today, [{ date: '2026-11-09T00:00:00.000Z' }, { date: '2026-11-02T00:00:00.000Z' }], [{ start: '2026-11-09T10:00:00.000Z' }], tz)).toBe(false);
  });

  it('ignores cancelled tasks and days beyond the week', () => {
    expect(hasPlannedDaysAhead(today, [{ date: '2026-11-10T00:00:00.000Z', status: 'CANCELLED' }, { date: '2026-11-20T00:00:00.000Z' }], [], tz)).toBe(false);
  });
});
