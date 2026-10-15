import { describe, expect, it } from 'vitest';
import { countByStatusTab, tasksOnDate } from '@/app/tasks/taskHelpers';
import { parseDateInTimezone } from '@/lib/dateUtils';
import { tasksPostponedFrom } from '@/lib/postpone';

/**
 * The Tasks page's status tabs (All, To do, In progress, Blocked, Done,
 * Postponed) used to count every task the account had, while the list under
 * them only showed the selected day - so scheduling something for tomorrow
 * raised today's "To do". These pin the counts to the selected day.
 */
const TZ = 'Asia/Kolkata';
type T = { id: string; status: string; date: string; createdAt?: string; deadline?: string; postponeHistory?: string };
const on = (ymd: string) => parseDateInTimezone(ymd, TZ).toISOString();
/** History of moves, each from -> to (day keys). */
const moved = (...moves: Array<[string, string]>) =>
  JSON.stringify(moves.map(([originalDate, newDate]) => ({ originalDate, newDate, movedAt: '2026-10-15T09:00:00.000Z' })));
const counts = (tasks: T[], day: string | null) =>
  countByStatusTab(tasksOnDate(tasks, day, TZ), tasksPostponedFrom(tasks, day, TZ).length);

const TODAY = '2026-10-15';
const TOMORROW = '2026-10-16';

describe('task counts follow the selected date', () => {
  it('a task scheduled for tomorrow does not raise today\'s To do or All', () => {
    const tasks: T[] = [
      { id: 'a', status: 'PENDING', date: on(TODAY) },
      { id: 'b', status: 'PENDING', date: on(TOMORROW) },
    ];
    expect(counts(tasks, TODAY)).toMatchObject({ ALL: 1, PENDING: 1 });
    expect(counts(tasks, TOMORROW)).toMatchObject({ ALL: 1, PENDING: 1 });
  });

  it('a task scheduled for today only counts on today', () => {
    const tasks: T[] = [{ id: 'a', status: 'IN_PROGRESS', date: on(TODAY) }];
    expect(counts(tasks, TODAY).IN_PROGRESS).toBe(1);
    expect(counts(tasks, TOMORROW)).toMatchObject({ ALL: 0, IN_PROGRESS: 0 });
    expect(counts(tasks, '2026-10-14').ALL).toBe(0);
  });

  it('counts each status, and All is their sum, for the selected date', () => {
    const tasks: T[] = [
      { id: '1', status: 'PENDING', date: on(TODAY) },
      { id: '2', status: 'PENDING', date: on(TODAY) },
      { id: '3', status: 'IN_PROGRESS', date: on(TODAY) },
      { id: '4', status: 'BLOCKED', date: on(TODAY) },
      // moved here from yesterday: scheduled today, postponed off yesterday
      { id: '5', status: 'COMPLETED', date: on(TODAY), postponeHistory: moved(['2026-10-14', TODAY]) },
      { id: '6', status: 'PENDING', date: on(TODAY), postponeHistory: moved(['2026-10-13', '2026-10-14'], ['2026-10-14', TODAY]) },
      // moved from today to tomorrow: postponed off today, scheduled tomorrow
      { id: '7', status: 'BLOCKED', date: on(TOMORROW), postponeHistory: moved([TODAY, TOMORROW]) },
    ];
    const c = counts(tasks, TODAY);
    expect(c).toEqual({ ALL: 6, PENDING: 3, IN_PROGRESS: 1, BLOCKED: 1, COMPLETED: 1, POSTPONED: 1 });
    expect(c.PENDING + c.IN_PROGRESS + c.BLOCKED + c.COMPLETED).toBe(c.ALL);
  });

  it('postponing today -> tomorrow: Postponed counts on today, the task is scheduled on tomorrow', () => {
    const task: T = { id: 'a', status: 'PENDING', date: on(TODAY) };
    expect(counts([task], TODAY)).toMatchObject({ ALL: 1, PENDING: 1, POSTPONED: 0 });
    const after = { ...task, date: on(TOMORROW), postponeHistory: moved([TODAY, TOMORROW]) };
    expect(counts([after], TODAY)).toMatchObject({ ALL: 0, PENDING: 0, POSTPONED: 1 });
    expect(counts([after], TOMORROW)).toMatchObject({ ALL: 1, PENDING: 1, POSTPONED: 0 });
  });

  it('changing status moves the task between tabs without double-counting', () => {
    const before: T[] = [{ id: 'a', status: 'PENDING', date: on(TODAY) }];
    const after: T[] = [{ ...before[0], status: 'COMPLETED' }];
    expect(counts(before, TODAY)).toMatchObject({ ALL: 1, PENDING: 1, COMPLETED: 0 });
    expect(counts(after, TODAY)).toMatchObject({ ALL: 1, PENDING: 0, COMPLETED: 1 });
  });

  it('counts by scheduled date, not by when it was created or its deadline', () => {
    const tasks: T[] = [
      { id: 'a', status: 'PENDING', date: on(TOMORROW), createdAt: on(TODAY), deadline: on(TODAY) },
    ];
    expect(counts(tasks, TODAY).ALL).toBe(0);
    expect(counts(tasks, TOMORROW).ALL).toBe(1);
  });

  it('uses the account timezone at day boundaries', () => {
    // 23:30 IST on the 15th is still 18:00 UTC on the 15th; 00:30 IST on the 16th is 19:00 UTC on the 15th.
    const tasks: T[] = [
      { id: 'late', status: 'PENDING', date: '2026-10-15T18:00:00.000Z' },
      { id: 'early', status: 'PENDING', date: '2026-10-15T19:00:00.000Z' },
    ];
    expect(tasksOnDate(tasks, TODAY, TZ).map((t) => t.id)).toEqual(['late']);
    expect(tasksOnDate(tasks, TOMORROW, TZ).map((t) => t.id)).toEqual(['early']);
  });

  it('gives the same answer every time it is recomputed (date switches, reloads)', () => {
    const tasks: T[] = [
      { id: '1', status: 'PENDING', date: on(TODAY) },
      { id: '2', status: 'BLOCKED', date: on(TOMORROW) },
    ];
    const first = [counts(tasks, TODAY), counts(tasks, TOMORROW)];
    const again = [counts(tasks, TOMORROW), counts(tasks, TODAY)].reverse();
    expect(again).toEqual(first);
  });

  it('with no date selected, counts everything', () => {
    const tasks: T[] = [
      { id: '1', status: 'PENDING', date: on(TODAY) },
      { id: '2', status: 'PENDING', date: on(TOMORROW) },
    ];
    expect(counts(tasks, null)).toMatchObject({ ALL: 2, PENDING: 2 });
  });
});
