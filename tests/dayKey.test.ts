import { describe, expect, it } from 'vitest';
import { toLocalDayKey, parseDateInTimezone } from '@/lib/dateUtils';

describe('toLocalDayKey', () => {
  it('keeps a plain day as-is', () => {
    expect(toLocalDayKey('2026-10-16', 'Asia/Kolkata')).toBe('2026-10-16');
    expect(toLocalDayKey('2026-10-16', 'America/New_York')).toBe('2026-10-16');
  });

  it('reads a stored (local-midnight) timestamp back as its own day in every zone', () => {
    for (const tz of ['Asia/Kolkata', 'Asia/Tokyo', 'Pacific/Auckland', 'UTC', 'America/New_York', 'Pacific/Honolulu']) {
      for (const day of ['2026-10-16', '2026-01-01', '2026-03-29', '2026-11-01']) {
        expect(toLocalDayKey(parseDateInTimezone(day, tz).toISOString(), tz)).toBe(day);
      }
    }
  });

  it('handles explicit offsets and late-evening instants', () => {
    // 23:30 IST on the 16th is 18:00 UTC on the 16th; 00:30 IST on the 17th is 19:00 UTC on the 16th.
    expect(toLocalDayKey('2026-10-16T18:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-16');
    expect(toLocalDayKey('2026-10-16T19:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-17');
    expect(toLocalDayKey('2026-10-16T23:30:00+05:30', 'Asia/Kolkata')).toBe('2026-10-16');
  });

  it('a local date-time with no zone keeps its own date', () => {
    expect(toLocalDayKey('2026-10-16T23:30', 'Asia/Kolkata')).toBe('2026-10-16');
  });
});
