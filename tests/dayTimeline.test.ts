import { describe, it, expect } from 'vitest';
import { columnPlacement, layoutDayEvents, EVENT_GAP_PX, MIN_EVENT_PX } from '@/lib/dayTimeline';

const H = 64; // px per hour, as on Today's planner
const at = (h: number, m = 0) => h * 60 + m;
const bottom = (b: { top: number; height: number }) => b.top + b.height;

describe('Today planner layout', () => {
  it('leaves a clear gap between an event ending at 12:00 and one starting at 12:00', () => {
    const [a, b] = layoutDayEvents([
      { id: 'a', startMins: at(11), endMins: at(12) },
      { id: 'b', startMins: at(12), endMins: at(13) },
    ], H);
    expect(b.top - bottom(a)).toBe(EVENT_GAP_PX);
    expect(a.columns).toBe(1);
    expect(b.columns).toBe(1);
    expect(a.overlaps || b.overlaps).toBe(false);
  });

  it('keeps the gap for half-hour events, which used to touch', () => {
    const [a, b] = layoutDayEvents([
      { id: 'a', startMins: at(11, 30), endMins: at(12) },
      { id: 'b', startMins: at(12), endMins: at(12, 30) },
    ], H);
    expect(b.top - bottom(a)).toBe(EVENT_GAP_PX);
    expect(a.columns).toBe(1);
  });

  it('puts a short event beside the next one instead of under it', () => {
    const [a, b] = layoutDayEvents([
      { id: 'a', startMins: at(13), endMins: at(13, 15) },
      { id: 'b', startMins: at(13, 15), endMins: at(13, 45) },
    ], H);
    expect(a.height).toBe(MIN_EVENT_PX);
    expect([a.column, b.column].sort()).toEqual([0, 1]);
    expect(a.columns).toBe(2);
    // Side by side for room, but their times don't clash.
    expect(a.overlaps || b.overlaps).toBe(false);
  });

  it('flags events whose times really overlap', () => {
    const blocks = layoutDayEvents([
      { id: 'a', startMins: at(9), endMins: at(10) },
      { id: 'b', startMins: at(9, 30), endMins: at(10, 30) },
      { id: 'c', startMins: at(11), endMins: at(12) },
    ], H);
    const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
    expect(byId.a.overlaps && byId.b.overlaps).toBe(true);
    expect(byId.a.column).not.toBe(byId.b.column);
    expect(byId.c).toMatchObject({ overlaps: false, columns: 1, column: 0 });
  });

  it('never draws a block over another in the same column', () => {
    const items = [
      { id: '1', startMins: at(8), endMins: at(8, 10) },
      { id: '2', startMins: at(8, 10), endMins: at(8, 20) },
      { id: '3', startMins: at(8, 20), endMins: at(9) },
      { id: '4', startMins: at(9), endMins: at(10) },
      { id: '5', startMins: at(9, 45), endMins: at(10, 15) },
    ];
    const blocks = layoutDayEvents(items, H);
    for (const a of blocks) for (const b of blocks) {
      if (a.id >= b.id || a.column !== b.column) continue;
      const apart = bottom(a) + EVENT_GAP_PX <= b.top + 1e-9 || bottom(b) + EVENT_GAP_PX <= a.top + 1e-9;
      expect(apart, `${a.id} and ${b.id}`).toBe(true);
    }
  });

  it('spaces side-by-side columns apart', () => {
    expect(columnPlacement(0, 1)).toEqual({ left: 'calc(0% + 0px)', width: 'calc(100% - 0px)' });
    expect(columnPlacement(0, 2)).toEqual({ left: 'calc(0% + 0px)', width: `calc(50% - ${EVENT_GAP_PX / 2}px)` });
    expect(columnPlacement(1, 2)).toEqual({ left: `calc(50% + ${EVENT_GAP_PX / 2}px)`, width: `calc(50% - ${EVENT_GAP_PX / 2}px)` });
  });
});
