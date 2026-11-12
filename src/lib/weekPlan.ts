import { getLocalDateString } from './dateUtils';

/**
 * Whether the coming days are already planned: at least one of the next
 * `days` days after `today` has a task dated on it or something on the
 * calendar. Today's "Plan the week" note is only for a week that's still
 * empty, so it stays away once the user has planned a few days ahead.
 */
export function hasPlannedDaysAhead(
  today: string,
  tasks: Array<{ date?: string | Date | null; status?: string }>,
  events: Array<{ start: string | Date }>,
  timezone: string,
  days = 6
): boolean {
  const ahead = new Set<string>();
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = 1; i <= days; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    ahead.add(d.toISOString().slice(0, 10));
  }
  return (
    tasks.some((t) => t.status !== 'CANCELLED' && !!t.date && ahead.has(getLocalDateString(t.date, timezone))) ||
    events.some((e) => ahead.has(getLocalDateString(e.start, timezone)))
  );
}
