import { describe, it, expect } from 'vitest';
import { checkDraft, hhmm, shiftDay, ymdIn } from '@/lib/awayTimes';

const NOW = new Date('2026-11-12T15:00:00Z');

describe('checking a break entered by hand', () => {
  it('works out the duration from start and end', () => {
    const c = checkDraft('2026-11-10', '10:00', '10:45', 'UTC', NOW);
    expect(c.error).toBeNull();
    expect(c.crossesMidnight).toBe(false);
    expect(c.end!.getTime() - c.start!.getTime()).toBe(45 * 60_000);
  });

  it('reads an end before the start as the next day, and keeps the start day', () => {
    const c = checkDraft('2026-11-10', '23:30', '00:15', 'UTC', NOW);
    expect(c.crossesMidnight).toBe(true);
    expect(c.start!.toISOString()).toBe('2026-11-10T23:30:00.000Z');
    expect(c.end!.toISOString()).toBe('2026-11-11T00:15:00.000Z');
    expect(c.error).toBeNull();
  });

  it('refuses entries over 12 hours, not started yet, or ending in the future', () => {
    expect(checkDraft('2026-11-10', '08:00', '21:00', 'UTC', NOW).error).toMatch(/12 hours/);
    expect(checkDraft('2026-11-12', '16:00', '16:30', 'UTC', NOW).error).toMatch(/hasn’t started/);
    expect(checkDraft('2026-11-12', '14:30', '15:30', 'UTC', NOW).error).toMatch(/future/);
  });

  it('waits for both times before judging', () => {
    expect(checkDraft('2026-11-10', '10:00', '', 'UTC', NOW)).toEqual({ start: null, end: null, crossesMidnight: false, error: null });
  });

  it('respects the time zone', () => {
    const c = checkDraft('2026-11-10', '09:00', '09:30', 'Asia/Kolkata', NOW);
    expect(c.start!.toISOString()).toBe('2026-11-10T03:30:00.000Z');
    expect(hhmm(c.start!, 'Asia/Kolkata')).toBe('09:00');
    expect(ymdIn('2026-11-10T20:00:00Z', 'Asia/Kolkata')).toBe('2026-11-11');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});
