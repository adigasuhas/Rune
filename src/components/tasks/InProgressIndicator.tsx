'use client';

import { useMinute } from '@/lib/useMinute';
import { inProgressIndicator, formatElapsedMinutes } from '@/lib/taskElapsed';

type Task = Parameters<typeof inProgressIndicator>[0];
type Slot = Parameters<typeof inProgressIndicator>[1][number];

/**
 * An in-progress task's elapsed time, kept quiet: a short label, and a 2px
 * strip along the row's bottom edge filling toward the estimate. The strip
 * reads "time used against the plan", never "% done" - past the estimate it
 * stays full and turns the warning tone, and the label keeps the real time.
 * No estimate, no strip (nothing to measure against); no slot, no time
 * (Rune doesn't invent a start). Re-renders once a minute; the fill eases
 * over 700ms and doesn't move at all under reduced motion.
 *
 * Render inside a `relative` row: `<InProgressStrip>` pins itself to its
 * bottom edge so it adds no height.
 */
export function useInProgress(task: Task, events: Slot[], timezone: string) {
  const now = useMinute();
  return inProgressIndicator(task, events, timezone, now);
}

export function InProgressLabel({ task, events, timezone }: { task: Task; events: Slot[]; timezone: string }) {
  const ind = useInProgress(task, events, timezone);
  if (!ind) return null;
  const text =
    ind.minutes === null ? 'In progress'
    : ind.state === 'not-started' ? 'In progress · starts later'
    : <>{formatElapsedMinutes(ind.minutes)} elapsed{ind.estimateMinutes ? <span className="hidden sm:inline"> of {formatElapsedMinutes(ind.estimateMinutes)}</span> : null}</>;
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] tabular-nums ${ind.over ? 'text-warning' : 'text-primary'}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      <span>{text}</span>
    </span>
  );
}

export function InProgressStrip({ task, events, timezone }: { task: Task; events: Slot[]; timezone: string }) {
  const ind = useInProgress(task, events, timezone);
  if (!ind || ind.ratio === null || ind.minutes === null) return null;
  const pct = Math.round(ind.ratio * 1000) / 10;
  return (
    <span
      role="progressbar"
      aria-label="Time elapsed against the estimate"
      aria-valuemin={0}
      aria-valuemax={ind.estimateMinutes ?? 0}
      aria-valuenow={Math.min(ind.minutes, ind.estimateMinutes ?? 0)}
      aria-valuetext={`${formatElapsedMinutes(ind.minutes)} of ${formatElapsedMinutes(ind.estimateMinutes ?? 0)}`}
      className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] overflow-hidden rounded-full bg-border/70"
    >
      <span
        className={`block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${ind.over ? 'bg-warning/80' : 'bg-primary/70'}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
