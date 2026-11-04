import { describe, it, expect } from 'vitest';
import { formatHoursValue, formatNumber, roundTo } from '@/lib/numberFormat';

describe('number formatting', () => {
  it('never shows more than two decimals', () => {
    expect(formatNumber(2.3333333)).toBe('2.33');
    expect(formatNumber(0.6666667)).toBe('0.67');
    expect(formatNumber(1 / 3 + 1)).toBe('1.33');
  });

  it('drops trailing zeros and keeps whole numbers whole', () => {
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(2.999)).toBe('3');
  });

  it('rounds halves the way they are written', () => {
    expect(roundTo(1.005)).toBe(1.01);
    expect(formatNumber(-0.001)).toBe('0');
  });

  it('treats missing or broken values as zero', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
  });

  it('hours carry their unit', () => {
    expect(formatHoursValue(1.3333333)).toBe('1.33h');
    expect(formatHoursValue(6.5)).toBe('6.5h');
  });
});
