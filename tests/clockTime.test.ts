import { describe, it, expect } from 'vitest';
import { nearestMeridiem, toH24 } from '@/lib/clockTime';

describe('time picker AM/PM', () => {
  it('moves to PM when 11 AM becomes 12, and to AM when 12 PM becomes 11', () => {
    expect(nearestMeridiem(11, 12)).toBe('PM');
    expect(nearestMeridiem(12, 11)).toBe('AM');
    expect(nearestMeridiem(11, 1)).toBe('PM');
    expect(nearestMeridiem(13, 11)).toBe('AM');
  });

  it('crosses midnight the same way', () => {
    expect(nearestMeridiem(23, 12)).toBe('AM');
    expect(nearestMeridiem(0, 11)).toBe('PM');
  });

  it('keeps AM/PM for changes away from noon or midnight', () => {
    expect(nearestMeridiem(9, 5)).toBe('AM');
    expect(nearestMeridiem(9, 10)).toBe('AM');
    expect(nearestMeridiem(15, 4)).toBe('PM');
    expect(nearestMeridiem(14, 8)).toBe('PM'); // a tie keeps the current half
  });

  it('converts to the 24-hour clock', () => {
    expect(toH24(12, 'AM')).toBe(0);
    expect(toH24(12, 'PM')).toBe(12);
    expect(toH24(1, 'PM')).toBe(13);
    expect(toH24(11, 'AM')).toBe(11);
  });
});
