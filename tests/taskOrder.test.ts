import { describe, expect, it } from 'vitest';
import { compareManualOrder, moveItem, planReorder, sortByManualOrder } from '@/lib/taskOrder';
import { inProgressIndicator } from '@/lib/taskElapsed';

type T = { id: string; manualOrder?: number | null; createdAt?: string; priority?: string; date?: string; status?: string };
const ids = (l: { id: string }[]) => l.map((t) => t.id);
/** Applies planReorder's writes, as the server would. */
const apply = (list: T[], writes: Array<{ id: string; manualOrder: number }>) =>
  list.map((t) => ({ ...t, manualOrder: writes.find((w) => w.id === t.id)?.manualOrder ?? t.manualOrder }));
/** Drag `from` -> `to` in the sorted list, save, re-sort (= a refresh). */
const drag = (list: T[], from: number, to: number) => {
  const sorted = sortByManualOrder(list);
  const next = moveItem(sorted, from, to);
  return sortByManualOrder(apply(list, planReorder(next, sorted[from].id)));
};

describe('manual To do order', () => {
  const fresh: T[] = [
    { id: 'c', createdAt: '2026-10-03T00:00:00Z', priority: 'CRITICAL' },
    { id: 'a', createdAt: '2026-10-01T00:00:00Z', priority: 'LOW' },
    { id: 'b', createdAt: '2026-10-02T00:00:00Z', priority: 'HIGH' },
  ];

  it('never sorts by priority or anything else: unplaced tasks are oldest-first', () => {
    expect(ids(sortByManualOrder(fresh))).toEqual(['a', 'b', 'c']);
  });

  it('placed tasks come first, in the user\'s order; new ones join the end', () => {
    const l = [{ id: 'x', manualOrder: 2 }, { id: 'y', manualOrder: 1 }, { id: 'new', createdAt: '2026-10-09T00:00:00Z' }];
    expect(ids(sortByManualOrder(l))).toEqual(['y', 'x', 'new']);
  });

  it('dragging a fresh list numbers it once, then later drags write one row', () => {
    const once = drag(fresh, 2, 0); // c to the top
    expect(ids(once)).toEqual(['c', 'a', 'b']);
    expect(once.every((t) => typeof t.manualOrder === 'number')).toBe(true);
    const sorted = sortByManualOrder(once);
    const writes = planReorder(moveItem(sorted, 0, 2), 'c');
    expect(writes).toHaveLength(1);
    expect(ids(sortByManualOrder(apply(once, writes)))).toEqual(['a', 'b', 'c']);
  });

  it('moves to the top, the bottom and the middle, and many drags stay consistent', () => {
    let l = drag(fresh, 0, 2);
    expect(ids(l)).toEqual(['b', 'c', 'a']);
    l = drag(l, 2, 0);
    expect(ids(l)).toEqual(['a', 'b', 'c']);
    l = drag(l, 0, 1);
    expect(ids(l)).toEqual(['b', 'a', 'c']);
    // Swap the top two 60 times: repeated bisection, then a renumber when the
    // gap runs out - the order stays exactly what was dragged.
    for (let i = 0; i < 60; i++) l = drag(l, 0, 1);
    expect(ids(l)).toEqual(['b', 'a', 'c']);
    expect(new Set(l.map((t) => t.manualOrder)).size).toBe(3);
  });

  it('renumbers when the gap runs out', () => {
    const tight = [{ id: 'p', manualOrder: 1 }, { id: 'q', manualOrder: 1 + 1e-9 }, { id: 'm', manualOrder: 5 }];
    const next = moveItem(sortByManualOrder(tight), 2, 1);
    const writes = planReorder(next, 'm');
    expect(writes.length).toBe(3);
    expect(ids(sortByManualOrder(apply(tight, writes)))).toEqual(['p', 'm', 'q']);
  });

  it('only ever writes manualOrder - priority, date and status are untouched', () => {
    const l: T[] = [
      { id: 'a', priority: 'LOW', date: '2026-10-16', status: 'PENDING' },
      { id: 'b', priority: 'HIGH', date: '2026-10-16', status: 'PENDING' },
    ];
    const writes = planReorder(moveItem(l, 1, 0), 'b');
    expect(writes.every((w) => Object.keys(w).sort().join() === 'id,manualOrder')).toBe(true);
  });

  it('a task that leaves To do and comes back keeps its place (the value is kept)', () => {
    const l = drag(fresh, 2, 0);
    const c = l.find((t) => t.id === 'c')!;
    const back = [...l.filter((t) => t.id !== 'c'), { ...c, status: 'PENDING' }];
    expect(ids(sortByManualOrder(back))).toEqual(['c', 'a', 'b']);
  });

  it('comparator is a total order', () => {
    expect(compareManualOrder({ id: 'a' }, { id: 'b' })).toBeLessThan(0);
    expect(compareManualOrder({ id: 'a', manualOrder: 1 }, { id: 'b' })).toBeLessThan(0);
  });
});

describe('inProgressIndicator', () => {
  const TZ = 'UTC';
  const slot = (s: string, e: string, completed = false) => ({ taskId: 't', start: s, end: e, completed });
  const t = (over: Record<string, unknown> = {}) => ({ id: 't', status: 'IN_PROGRESS', date: '2026-10-16T00:00:00Z', estimatedTime: 1, ...over });
  const now = new Date('2026-10-16T10:30:00Z');

  it('only for IN_PROGRESS tasks (done / blocked / to do have none)', () => {
    for (const status of ['COMPLETED', 'BLOCKED', 'PENDING']) {
      expect(inProgressIndicator(t({ status }), [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')], TZ, now)).toBeNull();
    }
  });

  it('elapsed against the estimate', () => {
    const r = inProgressIndicator(t(), [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')], TZ, now)!;
    expect(r).toMatchObject({ minutes: 30, estimateMinutes: 60, ratio: 0.5, over: false });
  });

  it('caps the fill at 100% past the estimate but keeps the real time', () => {
    const r = inProgressIndicator(t({ estimatedTime: 0.25 }), [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')], TZ, now)!;
    expect(r).toMatchObject({ minutes: 30, estimateMinutes: 15, ratio: 1, over: true });
  });

  it('no estimate: time only, no ratio', () => {
    const r = inProgressIndicator(t({ estimatedTime: 0 }), [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')], TZ, now)!;
    expect(r).toMatchObject({ minutes: 30, estimateMinutes: null, ratio: null });
  });

  it('no slot: no invented start time', () => {
    expect(inProgressIndicator(t(), [], TZ, now)).toMatchObject({ minutes: null, ratio: null, state: 'unscheduled' });
  });

  it('a slot starting later reads zero', () => {
    expect(inProgressIndicator(t(), [slot('2026-10-16T13:00:00Z', '2026-10-16T14:00:00Z')], TZ, now)).toMatchObject({ minutes: 0, ratio: 0, state: 'not-started' });
  });

  it('overnight: counts from its start across midnight', () => {
    const r = inProgressIndicator(t({ estimatedTime: 2 }), [slot('2026-10-16T23:30:00Z', '2026-10-17T02:00:00Z')], TZ, new Date('2026-10-17T00:30:00Z'))!;
    expect(r).toMatchObject({ minutes: 60, ratio: 0.5 });
  });

  it('editing the estimate changes only the ratio', () => {
    const ev = [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')];
    const a = inProgressIndicator(t({ estimatedTime: 1 }), ev, TZ, now)!;
    const b = inProgressIndicator(t({ estimatedTime: 2 }), ev, TZ, now)!;
    expect(a.minutes).toBe(b.minutes);
    expect([a.ratio, b.ratio]).toEqual([0.5, 0.25]);
  });

  it('same answer after a reload (stored data + clock only)', () => {
    const ev = [slot('2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z')];
    const again = JSON.parse(JSON.stringify({ task: t(), ev }));
    expect(inProgressIndicator(again.task, again.ev, TZ, now)).toEqual(inProgressIndicator(t(), ev, TZ, now));
  });
});
