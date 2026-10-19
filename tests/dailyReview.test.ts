import { describe, it, expect } from 'vitest';
import { addDays, firstFocusWindow, focusDayPhrase, isDateKey, isWorkingDate, nextWorkingDay } from '@/lib/dailyReview';

// 2026-10-16 is a Friday, 2026-10-19 a Monday.
describe('isWorkingDate', () => {
  it('defaults to Monday-Friday', () => {
    expect(isWorkingDate('2026-10-16', '')).toBe(true);
    expect(isWorkingDate('2026-10-17', '')).toBe(false);
    expect(isWorkingDate('2026-10-18', null)).toBe(false);
    // The legacy weekday-name default carries no per-date entries.
    expect(isWorkingDate('2026-10-19', 'Monday,Tuesday,Wednesday,Thursday,Friday')).toBe(true);
  });
  it('honours per-date entries like the Today page does', () => {
    const cfg = '2026-10-19:leave:Conference,2026-10-17:working,2026-10-20:off,cfg:2026-10,2026-10-21';
    expect(isWorkingDate('2026-10-19', cfg)).toBe(false);
    expect(isWorkingDate('2026-10-17', cfg)).toBe(true); // a worked Saturday
    expect(isWorkingDate('2026-10-20', cfg)).toBe(false);
    expect(isWorkingDate('2026-10-21', cfg)).toBe(true); // bare date = working
    expect(isWorkingDate('2026-10-22', '2026-10-22:other')).toBe(false);
  });
});

describe('nextWorkingDay', () => {
  it('Friday → Monday across a weekend', () => {
    expect(nextWorkingDay('2026-10-16', '')).toBe('2026-10-19');
  });
  it('a weekday points at the next day', () => {
    expect(nextWorkingDay('2026-10-19', '')).toBe('2026-10-20');
  });
  it('a review written on Saturday or Sunday points at Monday', () => {
    expect(nextWorkingDay('2026-10-17', '')).toBe('2026-10-19');
    expect(nextWorkingDay('2026-10-18', '')).toBe('2026-10-19');
  });
  it('skips leave and off days, and lands on a worked weekend day', () => {
    expect(nextWorkingDay('2026-10-16', '2026-10-19:leave,2026-10-20:off')).toBe('2026-10-21');
    expect(nextWorkingDay('2026-10-16', '2026-10-17:working')).toBe('2026-10-17');
  });
  it('crosses month and year boundaries', () => {
    expect(nextWorkingDay('2026-10-30', '')).toBe('2026-11-02');
    expect(nextWorkingDay('2026-12-31', '')).toBe('2027-01-01');
  });
});

describe('isDateKey / addDays', () => {
  it('accepts only real calendar dates', () => {
    expect(isDateKey('2026-10-19')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-10-19T00:00')).toBe(false);
    expect(isDateKey(20261019)).toBe(false);
  });
  it('adds days in UTC without DST drift', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('firstFocusWindow', () => {
  it('opens an hour before work starts and closes when work ends, in the user’s zone', () => {
    const w = firstFocusWindow('2026-10-19', '09:00', '17:30', 'Asia/Kolkata');
    expect(w.startsAt.toISOString()).toBe('2026-10-19T02:30:00.000Z'); // 08:00 IST
    expect(w.endsAt.toISOString()).toBe('2026-10-19T12:00:00.000Z'); // 17:30 IST
  });
  it('clamps the lead-in at midnight and runs an overnight shift to midnight', () => {
    const w = firstFocusWindow('2026-10-19', '00:30', '00:15', 'UTC');
    expect(w.startsAt.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(w.endsAt.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });
  it('falls back to 08:00-18:00 on malformed times', () => {
    const w = firstFocusWindow('2026-10-19', 'soon', '', 'UTC');
    expect(w.startsAt.toISOString()).toBe('2026-10-19T07:00:00.000Z');
    expect(w.endsAt.toISOString()).toBe('2026-10-19T18:00:00.000Z');
  });
});

describe('focusDayPhrase', () => {
  it('says tomorrow for the next calendar day, else the weekday', () => {
    expect(focusDayPhrase('2026-10-19', '2026-10-20')).toBe('tomorrow');
    expect(focusDayPhrase('2026-10-16', '2026-10-19')).toMatch(/Monday/);
  });
});
