import { describe, it, expect } from 'vitest';
import {
  clearDayTypes,
  cleanReason,
  countLeave,
  dateRange,
  dayKind,
  dayTypeOf,
  intensityLevel,
  leaveWindow,
  parseDayEntries,
  setDayTypes,
  workdayHours,
} from '@/lib/timeOff';
import { getWorkingDaysBetween } from '@/lib/analyticsUtils';
import { isWorkingDate } from '@/lib/dailyReview';

// Mon 2 Nov 2026 ... Sun 8 Nov 2026
const STORED = '2026-11-02,2026-11-03:leave:Family visit,2026-11-04:sick,2026-11-05:other:Conference,2026-11-07:working,cfg:2026-11';

describe('day kinds', () => {
  const entries = parseDayEntries(STORED);

  it('reads each stored type, and the default week where nothing is set', () => {
    expect(dayKind('2026-11-02', entries)).toBe('working'); // bare bootstrap date
    expect(dayKind('2026-11-03', entries)).toBe('leave');
    expect(dayKind('2026-11-04', entries)).toBe('sick');
    expect(dayKind('2026-11-05', entries)).toBe('other');
    expect(dayKind('2026-11-06', entries)).toBe('working'); // a Friday, nothing set
    expect(dayKind('2026-11-07', entries)).toBe('working'); // a Saturday set to working
    expect(dayKind('2026-11-08', entries)).toBe('weeklyOff'); // a Sunday
    expect(entries.get('2026-11-03')?.comment).toBe('Family visit');
  });

  it('days outside the availability dates are unavailable, unless set on purpose', () => {
    const availability = { from: '2026-11-04', until: '2026-11-06' };
    expect(dayKind('2026-11-02', entries, availability)).toBe('unavailable'); // bare date: still away
    expect(dayKind('2026-11-03', entries, availability)).toBe('leave'); // chosen: wins
    expect(dayKind('2026-11-06', entries, availability)).toBe('working');
    expect(dayKind('2026-11-09', entries, availability)).toBe('unavailable');
    expect(dayKind('2026-11-09', entries, { from: '2026-11-04' })).toBe('working'); // open end
  });

  it('preselects what a day is now when editing it', () => {
    expect(dayTypeOf('2026-11-04', entries)).toBe('sick');
    expect(dayTypeOf('2026-11-08', entries)).toBe('off');
    expect(dayTypeOf('2026-11-09', entries)).toBe('working');
  });

  it('sick leave is not a working day in Analytics or the daily review', () => {
    expect(getWorkingDaysBetween('2026-11-02', '2026-11-06', STORED)).toEqual(['2026-11-02', '2026-11-06']);
    expect(isWorkingDate('2026-11-04', STORED)).toBe(false);
  });
});

describe('setting days', () => {
  it('sets a stretch of days, keeping other entries and adding month markers', () => {
    const next = setDayTypes(STORED, dateRange('2026-11-30', '2026-12-01'), 'leave', 'Trip: Goa, India');
    const entries = parseDayEntries(next);
    expect(entries.get('2026-11-30')).toEqual({ type: 'leave', comment: 'Trip Goa India', typed: true });
    expect(entries.get('2026-12-01')?.type).toBe('leave');
    expect(entries.get('2026-11-04')?.type).toBe('sick');
    expect(next).toContain('cfg:2026-12');
    expect(next.match(/cfg:2026-11/g)).toHaveLength(1);
  });

  it('replaces a day rather than duplicating it, and clears back to the default', () => {
    const next = setDayTypes(STORED, ['2026-11-03'], 'working');
    expect(next.split(',').filter((e) => e.startsWith('2026-11-03'))).toEqual(['2026-11-03:working']);
    const cleared = clearDayTypes(next, ['2026-11-03', '2026-11-04']);
    expect(parseDayEntries(cleared).has('2026-11-03')).toBe(false);
    expect(parseDayEntries(cleared).has('2026-11-04')).toBe(false);
    expect(cleared).toContain('2026-11-05:other');
  });

  it('keeps a reason free of the stored format\'s separators', () => {
    expect(cleanReason(' a,b:c   d ')).toBe('a b c d');
  });

  it('a date range runs either way and stops at a year', () => {
    expect(dateRange('2026-12-31', '2026-12-29')).toEqual(['2026-12-29', '2026-12-30', '2026-12-31']);
    expect(dateRange('2026-01-01', '2030-01-01')).toHaveLength(366);
  });
});

describe('leave allowance', () => {
  const stored = '2025-12-31:leave,2026-01-02:leave,2026-03-10:sick,2026-11-03:leave,2027-01-04:leave';
  const entries = parseDayEntries(stored);

  it('counts per calendar year by default', () => {
    const w = leaveWindow('YEAR', '2026-11-02');
    expect(w).toEqual({ from: '2026-01-01', until: '2026-12-31', label: '2026' });
    expect(countLeave(entries, w)).toEqual({ leave: 2, sick: 1 });
  });

  it('or across the availability dates, open ends included', () => {
    expect(countLeave(entries, leaveWindow('PERIOD', '2026-11-02', { from: '2025-12-01', until: '2026-06-30' }))).toEqual({ leave: 2, sick: 1 });
    expect(countLeave(entries, leaveWindow('PERIOD', '2026-11-02', { from: '2026-06-01' }))).toEqual({ leave: 2, sick: 0 });
    // No dates set: falls back to the year.
    expect(leaveWindow('PERIOD', '2026-11-02', {}).label).toBe('2026');
  });
});

describe('shading by hours worked', () => {
  it('measures the working day', () => {
    expect(workdayHours('08:00', '18:00')).toBe(10);
    expect(workdayHours('22:00', '06:30')).toBe(8.5);
    expect(workdayHours('', 'x')).toBe(8);
  });

  it('steps from nothing to a full day', () => {
    expect(intensityLevel(0, 8)).toBe(0);
    expect(intensityLevel(1, 8)).toBe(1);
    expect(intensityLevel(2, 8)).toBe(2);
    expect(intensityLevel(4.5, 8)).toBe(3);
    expect(intensityLevel(6, 8)).toBe(4);
    expect(intensityLevel(12, 8)).toBe(4);
  });
});
