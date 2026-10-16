/**
 * Manual To do ordering: the user's own arrangement, set by dragging. It is
 * display order only (Task.manualOrder) and never touches priority,
 * schedule or status.
 *
 * Placed tasks (a number) come first, ascending; unplaced ones (null) follow
 * oldest-first, so a new task joins the end of the list and nothing is ever
 * auto-sorted by due date, priority or anything else.
 */

type Orderable = { id: string; manualOrder?: number | null; createdAt?: string | Date };

const createdMs = (t: Orderable) => (t.createdAt ? new Date(t.createdAt).getTime() || 0 : 0);

export function compareManualOrder(a: Orderable, b: Orderable): number {
  const ao = a.manualOrder, bo = b.manualOrder;
  const aPlaced = typeof ao === 'number' && Number.isFinite(ao);
  const bPlaced = typeof bo === 'number' && Number.isFinite(bo);
  if (aPlaced && bPlaced && ao !== bo) return (ao as number) - (bo as number);
  if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
  const c = createdMs(a) - createdMs(b);
  return c !== 0 ? c : a.id.localeCompare(b.id);
}

export function sortByManualOrder<T extends Orderable>(tasks: T[]): T[] {
  return [...tasks].sort(compareManualOrder);
}

/** Moves `list[from]` to index `to`, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

const STEP = 1024;

/**
 * The manualOrder writes that make `next` (the visible list, already in its
 * new arrangement after `movedId` was dropped) stick. Usually one write - the
 * moved task takes a value between its new neighbours. When the neighbours
 * aren't placed yet, or there's no room left between them, the whole visible
 * list is renumbered in its new order.
 */
export function planReorder(next: Orderable[], movedId: string): Array<{ id: string; manualOrder: number }> {
  const i = next.findIndex((t) => t.id === movedId);
  if (i < 0) return [];
  const num = (t?: Orderable) => (t && typeof t.manualOrder === 'number' && Number.isFinite(t.manualOrder) ? t.manualOrder : null);
  const prev = i > 0 ? num(next[i - 1]) : null;
  const after = i < next.length - 1 ? num(next[i + 1]) : null;
  const prevMissing = i > 0 && prev === null;
  const afterMissing = i < next.length - 1 && after === null;

  if (!prevMissing && !afterMissing) {
    let value: number | null = null;
    if (prev === null && after === null) value = 0;
    else if (prev === null) value = (after as number) - STEP;
    else if (after === null) value = prev + STEP;
    else if (after - prev > 1e-6) value = (prev + after) / 2;
    if (value !== null) return [{ id: movedId, manualOrder: value }];
  }
  return next.map((t, idx) => ({ id: t.id, manualOrder: (idx + 1) * STEP }));
}
