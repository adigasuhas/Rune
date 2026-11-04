/**
 * Numbers as people read them: never more than two decimals, and no
 * trailing zeros (2.3333 -> "2.33", 2.50 -> "2.5", 3.00 -> "3").
 */

export function roundTo(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  // Number.EPSILON keeps 1.005 rounding to 1.01, as written, not 1.
  return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
}

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  const r = roundTo(Number(n) || 0, decimals);
  return String(Object.is(r, -0) ? 0 : r);
}

/** "2.33h" */
export function formatHoursValue(h: number | null | undefined): string {
  return `${formatNumber(h)}h`;
}
