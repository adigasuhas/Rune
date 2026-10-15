import { describe, expect, it } from 'vitest';
import {
  appendPostponement,
  countPostponementsOnDays,
  formatPostponeDay,
  parsePostponeHistory,
  postponeDayKey,
  postponementsFrom,
  tasksPostponedFrom,
} from '@/lib/postpone';
import { tasksOnDate, countByStatusTab } from '@/app/tasks/taskHelpers';
import { parseDateInTimezone } from '@/lib/dateUtils';
import { calculateWorkingDayMetrics } from '@/lib/analyticsUtils';

const TZ = 'Asia/Kolkata';
const D14 = '2026-10-14';
const TODAY = '2026-10-15';
const TOMORROW = '2026-10-16';
const D18 = '2026-10-18';
const on = (ymd: string) => parseDateInTimezone(ymd, TZ).toISOString();

type T = { id: string; status: string; date: string; postponeHistory?: string };

/** Mimics the server: postpone `t` to `to`, logging the move from its stored date. */
function postpone(t: T, to: string, reason?: string): T {
  const from = postponeDayKey(t.date, TZ);
  return { ...t, date: on(to), postponeHistory: appendPostponement(t.postponeHistory, from, to, reason) };
}
const counts = (tasks: T[], day: string) => countByStatusTab(tasksOnDate(tasks, day, TZ), tasksPostponedFrom(tasks, day, TZ).length);

describe('postponement is attributed to the day it was moved from', () => {
  it('today -> tomorrow: today Postponed +1, tomorrow Postponed unchanged, task listed on tomorrow', () => {
    const t = postpone({ id: 'a', status: 'PENDING', date: on(TODAY) }, TOMORROW);
    expect(counts([t], TODAY)).toMatchObject({ ALL: 0, POSTPONED: 1 });
    expect(counts([t], TOMORROW)).toMatchObject({ ALL: 1, PENDING: 1, POSTPONED: 0 });
    expect(tasksOnDate([t], TOMORROW, TZ).map((x) => x.id)).toEqual(['a']);
    expect(tasksPostponedFrom([t], TODAY, TZ).map((x) => x.id)).toEqual(['a']);
  });

  it('tomorrow -> a later date: attributed to tomorrow, not today or the destination', () => {
    const t = postpone({ id: 'a', status: 'PENDING', date: on(TOMORROW) }, D18);
    expect(counts([t], TODAY).POSTPONED).toBe(0);
    expect(counts([t], TOMORROW)).toMatchObject({ ALL: 0, POSTPONED: 1 });
    expect(counts([t], D18)).toMatchObject({ ALL: 1, POSTPONED: 0 });
  });

  it('postponed several times: each move counts once, on its own origin day', () => {
    let t: T = { id: 'a', status: 'PENDING', date: on(D14) };
    t = postpone(t, TODAY);
    t = postpone(t, TOMORROW);
    t = postpone(t, D18);
    const history = parsePostponeHistory(t.postponeHistory);
    expect(history.map((e) => [e.originalDate, e.newDate])).toEqual([[D14, TODAY], [TODAY, TOMORROW], [TOMORROW, D18]]);
    for (const day of [D14, TODAY, TOMORROW]) {
      expect(postponementsFrom(t, day, TZ)).toBe(1);
      expect(counts([t], day).POSTPONED).toBe(1);
    }
    expect(counts([t], D18)).toMatchObject({ ALL: 1, POSTPONED: 0 });
    expect(countPostponementsOnDays([t], [D14, TODAY, TOMORROW, D18], TZ)).toBe(3);
  });

  it('a task postponed twice off the same day is one row in that day\'s tab, two events in the total', () => {
    const t: T = {
      id: 'a', status: 'PENDING', date: on(D18),
      postponeHistory: JSON.stringify([
        { originalDate: TODAY, newDate: TOMORROW },
        { originalDate: TODAY, newDate: D18 }, // moved back, then postponed again
      ]),
    };
    expect(counts([t], TODAY).POSTPONED).toBe(1);
    expect(postponementsFrom(t, TODAY, TZ)).toBe(2);
    expect(countPostponementsOnDays([t], [TODAY], TZ)).toBe(2);
  });

  it('does not leak into unrelated dates or other statuses', () => {
    const moved = postpone({ id: 'a', status: 'IN_PROGRESS', date: on(TODAY) }, TOMORROW);
    const other: T = { id: 'b', status: 'COMPLETED', date: on(TODAY) };
    const c = counts([moved, other], TODAY);
    expect(c).toEqual({ ALL: 1, PENDING: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 1, POSTPONED: 1 });
    expect(counts([moved, other], TOMORROW)).toEqual({ ALL: 1, PENDING: 0, IN_PROGRESS: 1, BLOCKED: 0, COMPLETED: 0, POSTPONED: 0 });
    expect(counts([moved, other], D14).POSTPONED).toBe(0);
    expect(counts([moved, other], D18).POSTPONED).toBe(0);
  });

  it('survives a reload: the same stored JSON gives the same counts', () => {
    const t = postpone({ id: 'a', status: 'PENDING', date: on(TODAY) }, TOMORROW);
    const reloaded = JSON.parse(JSON.stringify(t)) as T;
    expect(counts([reloaded], TODAY)).toEqual(counts([t], TODAY));
    expect(counts([reloaded], TOMORROW)).toEqual(counts([t], TOMORROW));
  });

  it('editing other fields keeps the history', () => {
    const t = postpone({ id: 'a', status: 'PENDING', date: on(TODAY) }, TOMORROW);
    const edited = { ...t, status: 'COMPLETED' };
    expect(counts([edited], TODAY).POSTPONED).toBe(1);
  });
});

describe('appendPostponement', () => {
  it('only logs a move to a later day', () => {
    expect(parsePostponeHistory(appendPostponement('[]', TODAY, D14))).toEqual([]);
    expect(parsePostponeHistory(appendPostponement('[]', TODAY, TODAY))).toEqual([]);
    expect(parsePostponeHistory(appendPostponement(null, TODAY, TOMORROW, '  waiting on samples '))).toMatchObject([
      { originalDate: TODAY, newDate: TOMORROW, reason: 'waiting on samples' },
    ]);
  });

  it('keeps existing entries and tolerates corrupt history', () => {
    const one = appendPostponement(null, D14, TODAY);
    expect(parsePostponeHistory(appendPostponement(one, TODAY, TOMORROW))).toHaveLength(2);
    expect(parsePostponeHistory(appendPostponement('not json', TODAY, TOMORROW))).toHaveLength(1);
  });
});

describe('legacy entries (originalDate stored as an ISO timestamp)', () => {
  it('read back as the local day, not the UTC date', () => {
    // Local midnight on the 15th in IST is 18:30 UTC on the 14th.
    const legacy = on(TODAY);
    expect(legacy.startsWith('2026-10-14')).toBe(true);
    expect(postponeDayKey(legacy, TZ)).toBe(TODAY);
    expect(formatPostponeDay(legacy, TZ)).toBe('Oct 15, 2026');
    const t: T = { id: 'a', status: 'PENDING', date: on(TOMORROW), postponeHistory: JSON.stringify([{ originalDate: legacy, newDate: TOMORROW }]) };
    expect(counts([t], TODAY).POSTPONED).toBe(1);
    expect(counts([t], TOMORROW).POSTPONED).toBe(0);
  });
});

describe('analytics postponement rate', () => {
  it('counts moves made off working days, not tasks now sitting on them', () => {
    // Postponed off Thu 15th onto Sat 17th (an off day).
    const t = { id: 'a', status: 'PENDING', date: on('2026-10-17'), postponeHistory: JSON.stringify([{ originalDate: TODAY, newDate: '2026-10-17' }]) };
    const m = calculateWorkingDayMetrics([TODAY], [t], [], [], TZ);
    expect(m.totalPostponeCount).toBe(1);
    const elsewhere = calculateWorkingDayMetrics(['2026-10-17'], [t], [], [], TZ);
    expect(elsewhere.totalPostponeCount).toBe(0);
  });
});
