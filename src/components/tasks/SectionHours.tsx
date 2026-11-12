'use client';

import { useMinute } from '@/lib/useMinute';
import { getTaskElapsed, getTaskSlotIntervals, formatElapsedMinutes } from '@/lib/taskElapsed';
import { formatHours } from '@/lib/timeOff';

/**
 * The hours beside each state heading on the Tasks list, one quiet pill each:
 *
 *   In progress  1h20m elapsed · of 3h planned   (live, with a small meter)
 *   To do        6.5h planned
 *   Done         4h10m worked
 *
 * The meter fills toward the planned time; past it, it stays full and the
 * badge turns the warning tone, and the words say "over" so colour is never
 * the only cue.
 */

type Slot = Parameters<typeof getTaskElapsed>[1][number];
type ElapsedTask = Parameters<typeof getTaskElapsed>[0] & { estimatedTime?: number | null };

function Meter({ value, of, over, lead, tail, title }: { value: number; of: number | null; over: boolean; lead: React.ReactNode; tail: React.ReactNode; title?: string }) {
  const fill = of ? Math.min(value / of, 1) : 0;
  return (
    <span
      className={`inline-flex h-6 items-center gap-2 rounded-full border px-2.5 text-[12px] font-normal ${over ? 'border-warning/40 bg-warning-soft text-warning' : 'border-border bg-surface text-ink-secondary'}`}
      title={title}
    >
      {of !== null && of > 0 && (
        <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-surface-sunken">
          <span
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${over ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${Math.max(fill * 100, value > 0 ? 6 : 0)}%` }}
          />
        </span>
      )}
      <span className="tabular-nums">
        {lead}
        {tail && <span className={over ? '' : 'text-ink-faint'}> · {tail}</span>}
      </span>
    </span>
  );
}

const strong = (over: boolean, text: string) => <span className={`font-semibold ${over ? '' : 'text-foreground'}`}>{text}</span>;

/**
 * In progress: time elapsed across every session of every task in the
 * section (the same figure each row shows), against their estimates.
 * Re-renders once a minute.
 */
export function ElapsedHoursBadge({ tasks, events, timezone }: { tasks: ElapsedTask[]; events: Slot[]; timezone: string }) {
  const now = useMinute();
  if (tasks.length === 0) return null;
  const minutes = tasks.reduce((m, t) => m + getTaskElapsed(t, events, timezone, now).minutes, 0);
  const planned = tasks.reduce((h, t) => h + (t.estimatedTime && t.estimatedTime > 0 ? t.estimatedTime : 0), 0);
  const plannedMin = Math.round(planned * 60);
  const over = plannedMin > 0 && minutes > plannedMin;
  return (
    <Meter
      value={minutes}
      of={plannedMin || null}
      over={over}
      title={`Time elapsed on the scheduled sessions of ${tasks.length === 1 ? 'this task' : `these ${tasks.length} tasks`}${plannedMin ? `, against ${formatHours(planned)} planned` : ''}`}
      lead={<>{strong(over, formatElapsedMinutes(minutes))} elapsed</>}
      tail={plannedMin ? (over ? `${formatElapsedMinutes(minutes - plannedMin)} over` : `of ${formatHours(planned)} planned`) : null}
    />
  );
}

/** A task's planned hours: its estimate, else the length of its scheduled slots. */
function plannedHours(task: ElapsedTask, events: Slot[], timezone: string): number {
  if (task.estimatedTime && task.estimatedTime > 0) return task.estimatedTime;
  return getTaskSlotIntervals(task, events, timezone).reduce((h, i) => h + (i.end.getTime() - i.start.getTime()) / 3_600_000, 0);
}

/** To do: the hours planned for the section. Nothing shows when none are. */
export function PlannedHoursBadge({ tasks, events, timezone }: { tasks: ElapsedTask[]; events: Slot[]; timezone: string }) {
  const planned = tasks.reduce((h, t) => h + plannedHours(t, events, timezone), 0);
  if (planned <= 0) return null;
  return (
    <Meter
      value={0}
      of={null}
      over={false}
      title={`Planned for ${tasks.length === 1 ? 'this task' : `these ${tasks.length} tasks`}: their estimates, or their scheduled time where there's no estimate`}
      lead={<>{strong(false, formatHours(planned))} planned</>}
      tail={null}
    />
  );
}

/** Done: the time worked on the finished tasks (their recorded time). */
export function WorkedHoursBadge({ tasks, events, timezone }: { tasks: ElapsedTask[]; events: Slot[]; timezone: string }) {
  const minutes = tasks.reduce((m, t) => m + getTaskElapsed(t, events, timezone).minutes, 0);
  if (minutes <= 0) return null;
  return (
    <Meter
      value={minutes}
      of={null}
      over={false}
      title={`Time worked on ${tasks.length === 1 ? 'this finished task' : `these ${tasks.length} finished tasks`}`}
      lead={<>{strong(false, formatElapsedMinutes(minutes))} worked</>}
      tail={null}
    />
  );
}
