/**
 * Cancelling a task: dropping it on purpose, with a reason, the way
 * postponing moves it with one. A cancelled task is kept for the record
 * (Tasks -> Cancelled, with its reason and date) but leaves every plan:
 * it isn't open, isn't done, and doesn't count toward completion rates,
 * hours planned, reminders or the weekly digest.
 */

export const CANCELLED = 'CANCELLED' as const;

/** The longest reason kept (the same limit as a postpone or block reason). */
export const CANCEL_REASON_MAX = 500;

/**
 * Suggested reasons, one tap each. The writer can still say it their own
 * way; a suggestion just fills the box.
 */
export const CANCEL_REASONS = [
  'No longer needed',
  'Plans changed',
  'Done some other way',
  'Duplicate of another task',
  'Out of my hands',
  'Not worth the time now',
] as const;

export function isCancelled(task: { status?: string | null } | null | undefined): boolean {
  return task?.status === CANCELLED;
}

/** Everything except cancelled tasks - what every plan, count and rate works from. */
export function withoutCancelled<T extends { status?: string | null }>(tasks: T[] | null | undefined): T[] {
  return (tasks || []).filter((t) => t?.status !== CANCELLED);
}

/** A reason as stored: trimmed, single-spaced, capped; null when empty. */
export function cleanCancelReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  const r = reason.replace(/\s+/g, ' ').trim().slice(0, CANCEL_REASON_MAX);
  return r || null;
}
