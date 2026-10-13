import { describe, expect, it } from 'vitest';
import { timezoneLabel } from '@/lib/timezoneLabel';
import { todayLine } from '@/lib/todayLines';

describe('timezoneLabel', () => {
  const d = new Date('2026-10-07T05:00:00Z');
  it('finds the local abbreviation and a compact offset', () => {
    expect(timezoneLabel('Asia/Kolkata', d)).toEqual({ abbr: 'IST', offset: 'UTC+5:30' });
    expect(timezoneLabel('America/New_York', d)).toEqual({ abbr: 'EDT', offset: 'UTC-4' });
    expect(timezoneLabel('Europe/London', d)).toEqual({ abbr: 'BST', offset: 'UTC+1' });
  });
  it('falls back to the city when no abbreviation exists', () => {
    expect(timezoneLabel('Asia/Tokyo', d)).toEqual({ abbr: 'Tokyo', offset: 'UTC+9' });
  });
  it('handles UTC and bad input', () => {
    expect(timezoneLabel('UTC', d)).toEqual({ abbr: 'UTC', offset: '' });
    expect(timezoneLabel('Not/AZone', d).abbr).toBe('Not/AZone');
  });
});

describe('todayLine', () => {
  const base = { hour: 9, dayOfYear: 280, open: 3, done: 0, overdue: 0 };
  it('is stable for the same hour and changes across hours', () => {
    expect(todayLine(base)).toBe(todayLine(base));
    const seen = new Set(Array.from({ length: 3 }, (_, h) => todayLine({ ...base, hour: 8 + h })));
    expect(seen.size).toBeGreaterThan(1);
  });
  it('reacts to the day', () => {
    expect(todayLine({ ...base, open: 0, done: 4 })).toMatch(/done|cleared|Done/);
    expect(todayLine({ ...base, offDay: true })).toMatch(/off|keep|Rest|needs/i);
  });
});
