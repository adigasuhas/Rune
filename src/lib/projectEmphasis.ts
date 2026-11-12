/**
 * How strongly a project's colour shows on the Projects page. Two things
 * set it, each on its own channel so they never read as one another:
 *
 *  - Priority sets the EDGE: the strength of the colour rail on the row's
 *    left (and the label beside the name, so it never rests on colour alone).
 *  - Time invested sets the TINT: how deeply the row is washed in the
 *    project's colour. It is your recorded work (focused time: ticked-off
 *    slots, less breaks and brain drain - never scheduled time) over the
 *    last 30 days, relative to your busiest project in that window, so an
 *    old project doesn't outshine everything just for having existed longer.
 *
 * A high-priority project you haven't touched yet: strong edge, pale tint.
 * A low-priority project you've sunk hours into: faint edge, deep tint.
 */

export const INVESTMENT_WINDOW_DAYS = 30;
/** Below this many hours in the window, the busiest project isn't "full" either. */
export const INVESTMENT_FLOOR_HOURS = 10;

const PRIORITY_WEIGHT: Record<string, number> = { LOW: 0.15, MEDIUM: 0.45, HIGH: 0.75, CRITICAL: 1 };

export interface Emphasis {
  /** 0-1: share of the busiest project's recent hours (square-rooted, so small amounts still show). */
  investment: number;
  /** 0-1 from priority. */
  priority: number;
  /** Colour strength of the rail, 0-100 (percent of the project colour). */
  edgePct: number;
  /** Colour strength of the row wash, 0-100. */
  tintPct: number;
  /** 0-4 filled steps for the small "invested" scale. */
  investmentSteps: number;
}

export function projectEmphasis(priority: string | null | undefined, recentHours: number, busiestRecentHours: number): Emphasis {
  const p = PRIORITY_WEIGHT[priority || 'MEDIUM'] ?? PRIORITY_WEIGHT.MEDIUM;
  const denominator = Math.max(INVESTMENT_FLOOR_HOURS, busiestRecentHours || 0);
  const share = Math.min(1, Math.max(0, (recentHours || 0) / denominator));
  const investment = Math.sqrt(share);
  return {
    investment,
    priority: p,
    edgePct: Math.round(28 + 72 * p),
    // Capped at 8%: with the darkest project colours, every text colour on
    // the row (down to the red "overdue") stays at WCAG AA contrast.
    tintPct: Math.round(8 * investment),
    investmentSteps: recentHours > 0 ? Math.max(1, Math.round(investment * 4)) : 0,
  };
}

/** CSS colour: `color` at `pct`% strength over transparent. Works with hex and var(). */
export function tint(color: string | null | undefined, pct: number): string {
  const c = color || 'var(--border-strong)';
  return `color-mix(in oklab, ${c} ${Math.max(0, Math.min(100, pct))}%, transparent)`;
}
