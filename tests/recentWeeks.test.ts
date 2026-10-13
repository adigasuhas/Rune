import { describe, it, expect } from 'vitest';
import { firstActiveDay, mondayOf, recentWeeksStart } from '@/lib/activity';

/**
 * Today's "Recent weeks" graph used to always span 26 weeks. It now opens on
 * a compact, useful range - see recentWeeksStart in src/lib/activity.ts.
 * 2026-10-13 is a Tuesday.
 */
const today = '2026-10-13';
const weeksBetween = (start: string) =>
  (Date.parse(`${mondayOf(today)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 604_800_000 + 1;

describe('recentWeeksStart', () => {
  it('always starts on a Monday, never after this week', () => {
    for (const memberSince of [null, '2025-01-01', '2026-10-13', '2026-10-12']) {
      for (const firstActivity of [null, '2024-03-03', '2026-09-30', '2026-10-13']) {
        const start = recentWeeksStart({ today, memberSince, firstActivity });
        expect(mondayOf(start)).toBe(start);
        expect(start <= mondayOf(today)).toBe(true);
      }
    }
  });

  describe('case A: a new account', () => {
    it('created this week: just this week, no empty weeks from before it existed', () => {
      expect(recentWeeksStart({ today, memberSince: '2026-10-12', firstActivity: '2026-10-12' })).toBe('2026-10-12');
      expect(recentWeeksStart({ today, memberSince: '2026-10-13', firstActivity: null })).toBe('2026-10-12');
    });

    it('created three weeks ago: from the week it was created', () => {
      const start = recentWeeksStart({ today, memberSince: '2026-09-24', firstActivity: '2026-09-25' });
      expect(start).toBe('2026-09-21');
      expect(weeksBetween(start)).toBe(4);
    });

    it('created six weeks ago with activity from day one: from its first week, under two months', () => {
      const start = recentWeeksStart({ today, memberSince: '2026-09-01', firstActivity: '2026-09-02' });
      expect(start).toBe('2026-08-31');
      expect(weeksBetween(start)).toBeLessThanOrEqual(8);
    });
  });

  describe('case B: an old account that has only just started being used', () => {
    it('a year-old account active for two weeks: about a month, not six months of blanks', () => {
      const start = recentWeeksStart({ today, memberSince: '2025-06-01', firstActivity: '2026-10-01' });
      expect(weeksBetween(start)).toBe(4);
    });

    it('active for seven weeks: from the first active week', () => {
      const start = recentWeeksStart({ today, memberSince: '2025-06-01', firstActivity: '2026-08-26' });
      expect(start).toBe(mondayOf('2026-08-26'));
    });

    it('no activity at all: a compact month, and the graph still has days to draw', () => {
      const start = recentWeeksStart({ today, memberSince: '2024-01-01', firstActivity: null });
      expect(weeksBetween(start)).toBe(4);
    });

    it('ignores "activity" dated in the future', () => {
      expect(recentWeeksStart({ today, memberSince: '2024-01-01', firstActivity: '2027-01-01' })).toBe(
        recentWeeksStart({ today, memberSince: '2024-01-01', firstActivity: null })
      );
    });
  });

  describe('case C: an established account', () => {
    it('years of history: still only the last ~two months by default', () => {
      const start = recentWeeksStart({ today, memberSince: '2023-02-01', firstActivity: '2023-02-03' });
      expect(weeksBetween(start)).toBe(8);
    });
  });
});

describe('firstActiveDay', () => {
  const tz = 'Asia/Kolkata';
  it('counts completed tasks and calendar blocks that have started, in the user’s zone', () => {
    const tasks = [
      { date: '2026-08-10T10:00:00Z', status: 'PENDING' }, // not activity
      { date: '2026-09-02T20:00:00Z', status: 'COMPLETED' }, // 3 Sep in IST
    ];
    const events = [{ start: '2026-11-20T09:00:00Z' }]; // future: not yet activity
    expect(firstActiveDay(tasks, events, tz, today)).toBe('2026-09-03');
  });

  it('returns null with nothing done yet', () => {
    expect(firstActiveDay([{ date: '2026-09-01', status: 'PENDING' }], [], tz, today)).toBeNull();
  });
});
