'use client';

import { useMinute } from '@/lib/useMinute';
import { getTaskElapsed, formatElapsedMinutes } from '@/lib/taskElapsed';
import { formatHours } from '@/lib/timeOff';

/**
 * The hours beside each section heading on the Tasks list - one figure and
 * one small meter, read the same way in every section:
 *
 *   To do        2.5h planned today · of 8h      (against the working day)
 *   In progress  1h20m elapsed · of 3h planned   (live, every session counted)
 *   Done         4.5h spent · 0.5h over plan     (against what was planned)
 *
 * The meter fills toward the second figure; past it, it stays full and the
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

/** To do: hours planned for the day on screen, against the working day. With no day picked, the list's own total. */
export function PlannedHoursBadge({ planned, dayHours, dayLabel }: { planned: number; dayHours: number | null; dayLabel: string | null }) {
  if (!(planned > 0) && dayHours === null) return null;
  const over = dayHours !== null && planned > dayHours;
  const when = dayLabel ? ` ${dayLabel === 'today' ? 'today' : `for ${dayLabel}`}` : '';
  return (
    <Meter
      value={planned}
      of={dayHours}
      over={over}
      title={dayHours !== null ? `${formatHours(planned)} planned${dayLabel ? ` for ${dayLabel}` : ''}, against a ${formatHours(dayHours)} working day` : undefined}
      lead={<>{strong(over, formatHours(planned))} planned{when}</>}
      tail={dayHours !== null ? (over ? `${formatHours(planned - dayHours)} over` : `of ${formatHours(dayHours)}`) : null}
    />
  );
}

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

/** Done: the time the finished tasks took, against what was planned for them. */
export function SpentHoursBadge({ tasks }: { tasks: Array<{ actualTime?: number | null; estimatedTime?: number | null }> }) {
  if (tasks.length === 0) return null;
  const spent = tasks.reduce((h, t) => h + (t.actualTime && t.actualTime > 0 ? t.actualTime : 0), 0);
  const planned = tasks.reduce((h, t) => h + (t.estimatedTime && t.estimatedTime > 0 ? t.estimatedTime : 0), 0);
  const diff = Math.round((spent - planned) * 10) / 10;
  const over = planned > 0 && diff > 0;
  return (
    <Meter
      value={spent}
      of={planned || null}
      over={over}
      title={`${formatHours(spent)} spent on ${tasks.length === 1 ? 'this task' : `these ${tasks.length} tasks`}${planned ? `, against ${formatHours(planned)} planned` : ''}`}
      lead={<>{strong(over, formatHours(spent))} spent</>}
      tail={planned ? (over ? `${formatHours(diff)} over plan` : diff < 0 ? `${formatHours(-diff)} under plan` : 'on plan') : null}
    />
  );
}
