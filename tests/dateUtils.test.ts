import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  formatRelativeDeadline,
  isoWeekKey,
  startOfWeekDateString
} from '@/lib/dateUtils';

describe('daysUntil', () => {
  it('is 0 for later today', () => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    expect(daysUntil(d)).toBe(0);
  });
  it('is positive for the future, negative for the past', () => {
    const future = new Date(Date.now() + 5 * 86400000);
    const past = new Date(Date.now() - 3 * 86400000);
    expect(daysUntil(future)).toBe(5);
    expect(daysUntil(past)).toBe(-3);
  });
});

describe('formatRelativeDeadline', () => {
  it('phrases near dates', () => {
    expect(formatRelativeDeadline(new Date())).toBe('due today');
    expect(formatRelativeDeadline(new Date(Date.now() + 86400000))).toBe('due tomorrow');
    expect(formatRelativeDeadline(new Date(Date.now() + 3 * 86400000))).toBe('in 3 days');
  });
  it('phrases overdue dates', () => {
    expect(formatRelativeDeadline(new Date(Date.now() - 86400000))).toBe('1 day overdue');
    expect(formatRelativeDeadline(new Date(Date.now() - 3 * 86400000))).toBe('3 days overdue');
  });
  it('returns null with no date', () => {
    expect(formatRelativeDeadline(null)).toBeNull();
    expect(formatRelativeDeadline(undefined)).toBeNull();
  });
});

describe('isoWeekKey / startOfWeekDateString', () => {
  it('produces a stable YYYY-Www key', () => {
    expect(isoWeekKey('2026-01-01', 'UTC')).toMatch(/^\d{4}-W\d{2}$/);
  });
  it('the whole ISO week maps to one key', () => {
    // 2026-08-24 (Mon) .. 2026-08-30 (Sun) is one ISO week
    const mon = isoWeekKey('2026-08-24', 'UTC');
    const sun = isoWeekKey('2026-08-30', 'UTC');
    expect(mon).toBe(sun);
    // the next day rolls over
    expect(isoWeekKey('2026-08-31', 'UTC')).not.toBe(mon);
  });
  it('startOfWeek is the Monday', () => {
    expect(startOfWeekDateString('2026-08-30', 'UTC')).toBe('2026-08-24');
    expect(startOfWeekDateString('2026-08-24', 'UTC')).toBe('2026-08-24');
  });
});
