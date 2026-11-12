/** Projects in the user's saved Wall order; ones not in it keep their usual order, after. */
export function orderProjects<T extends { id: string }>(projects: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return projects
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (rank.get(a.p.id) ?? order.length + a.i) - (rank.get(b.p.id) ?? order.length + b.i))
    .map(({ p }) => p);
}

/** `ids` with `id` moved to `toIndex`. */
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  return next;
}
