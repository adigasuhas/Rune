/**
 * Where each event sits on Today's planner.
 *
 * Every block's top edge sits just under its start-time line, so blocks
 * line up with the hour grid and with each other. The block stops
 * EVENT_GAP_PX short of its end time, so one that ends at 12:00 and the next
 * that starts at 12:00 have a clear gap between them.
 *
 * At 64px an hour a 15-minute event still fits one line of text, so only
 * events shorter than that are drawn taller than their time. If that extra
 * height would reach into the next event, the two go side by side instead of
 * one covering the other. Everything else stays full width.
 *
 * `overlaps` only means the times really overlap; side-by-side placement
 * for a short block alone isn't flagged as a clash.
 */

/** The space between blocks that meet in time, and between side-by-side columns. */
export const EVENT_GAP_PX = 4;
/** How far a block's top sits below its start-time line, clear of the grid line. */
export const TOP_INSET_PX = 1;
/** The smallest a block is drawn: one line of small text (a 15-minute event). */
export const MIN_EVENT_PX = 12;

export interface TimelineItem {
  id: string;
  /** Minutes from the start of the day. */
  startMins: number;
  endMins: number;
}

export interface TimelineBlock extends TimelineItem {
  top: number;
  height: number;
  column: number;
  columns: number;
  overlaps: boolean;
}

export function layoutDayEvents(items: TimelineItem[], hourHeight: number): TimelineBlock[] {
  const minSpanMins = ((MIN_EVENT_PX + EVENT_GAP_PX) / hourHeight) * 60;
  const sorted = items
    .map((it) => ({ ...it, drawnEnd: Math.max(it.endMins, it.startMins + minSpanMins) }))
    .sort((a, b) => a.startMins - b.startMins || b.endMins - b.startMins - (a.endMins - a.startMins) || a.id.localeCompare(b.id));

  // Clusters: runs of blocks whose drawn extents chain together.
  const clusters: (typeof sorted)[] = [];
  let current: typeof sorted = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (item.startMins >= clusterEnd) {
      if (current.length) clusters.push(current);
      current = [item];
      clusterEnd = item.drawnEnd;
    } else {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.drawnEnd);
    }
  }
  if (current.length) clusters.push(current);

  const out: TimelineBlock[] = [];
  for (const cluster of clusters) {
    const columns: (typeof sorted)[] = [];
    const columnOf = new Map<string, number>();
    for (const item of cluster) {
      let c = 0;
      while (columns[c]?.some((o) => item.startMins < o.drawnEnd && item.drawnEnd > o.startMins)) c++;
      (columns[c] ??= []).push(item);
      columnOf.set(item.id, c);
    }
    for (const item of cluster) {
      const pxHeight = ((item.endMins - item.startMins) / 60) * hourHeight;
      out.push({
        id: item.id,
        startMins: item.startMins,
        endMins: item.endMins,
        top: (item.startMins / 60) * hourHeight + TOP_INSET_PX,
        height: Math.max(pxHeight - EVENT_GAP_PX, MIN_EVENT_PX),
        column: columnOf.get(item.id) ?? 0,
        columns: columns.length,
        overlaps: cluster.some((o) => o.id !== item.id && item.startMins < o.endMins && item.endMins > o.startMins),
      });
    }
  }
  return out;
}

/** CSS left/width for a block's column, with a gap between neighbouring columns. */
export function columnPlacement(column: number, columns: number): { left: string; width: string } {
  const share = 100 / columns;
  const inLeft = column > 0 ? EVENT_GAP_PX / 2 : 0;
  const inRight = column < columns - 1 ? EVENT_GAP_PX / 2 : 0;
  return {
    left: `calc(${share * column}% + ${inLeft}px)`,
    width: `calc(${share}% - ${inLeft + inRight}px)`,
  };
}
