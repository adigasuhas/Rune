'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Task } from '@/app/tasks/types';
import type { CalendarEntry } from '@/app/tasks/taskCalendar';
import { plannedHours } from '@/app/tasks/taskCalendar';
import { DAY_KIND_LABEL, formatHours, isWeekend } from '@/lib/timeOff';
import { tickClass, type DayInfo } from './TaskCalendar';

/**
 * One day of the Tasks calendar, opened out: the page under a collapsed
 * week. Read like a diary page - the date set large, the day's figures to
 * the right, then every task in the order the day runs (timed tasks by
 * start, then the rest), each against a time in the margin. The rows are the
 * ordinary task rows, so every action the list has works here too.
 */
export function DayAgenda({
  dayKey, isToday, entries, info, timezone, renderRow, onAdd,
}: {
  dayKey: string;
  isToday: boolean;
  entries: CalendarEntry<Task>[];
  info?: DayInfo;
  timezone: string;
  renderRow: (task: Task) => React.ReactNode;
  onAdd: () => void;
}) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const weekday = date.toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' });
  const title = date.toLocaleDateString([], { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const kind = info?.kind ?? (isWeekend(dayKey) ? 'weeklyOff' : 'working');
  const done = entries.filter((e) => e.task.status === 'COMPLETED').length;
  const planned = plannedHours(entries);
  const worked = info?.worked ?? 0;
  // "8:30" with a small "AM" after it, so the margin stays one line wide.
  const timeParts = (d: Date) => {
    const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: timezone }).formatToParts(d);
    const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
    const clock = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    return { clock, period };
  };
  const headingId = `agenda-${dayKey}`;

  return (
    <section aria-labelledby={headingId} className="cal-reveal">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-[color-mix(in_srgb,var(--text)_75%,transparent)] pb-3.5">
        <div className="min-w-0 mr-auto">
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-secondary">
            <span>{isToday ? `Today, ${weekday}` : weekday}</span>
            <span
              data-day-kind={kind}
              data-level={1}
              className="day-tint day-text inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold shadow-[inset_0_0_0_1px_var(--border-c)]"
            >
              <span className="day-ink h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              {DAY_KIND_LABEL[kind]}
              {info?.reason ? <span className="font-normal">· {info.reason}</span> : null}
            </span>
          </p>
          <h2 id={headingId} className="mt-1 font-serif text-[30px] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
            {title}
          </h2>
        </div>

        <dl className="flex items-end gap-6 tabular-nums">
          <Figure label="Tasks" value={String(entries.length)} note={entries.length ? `${done} done` : undefined} />
          <Figure label="Planned" value={formatHours(planned)} />
          <Figure label="Worked" value={formatHours(worked)} />
        </dl>

        <Button variant="ghost" onClick={onAdd} className="shrink-0">
          <Plus className="h-4 w-4 text-ink-faint" /> Add a task
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-serif text-[18px] text-foreground">A clear day.</p>
          <p className="mt-1 text-[13.5px] text-ink-secondary">Nothing is planned for {isToday ? 'today' : title}.</p>
        </div>
      ) : (
        <ol aria-label={`Tasks on ${weekday} ${title}`}>
          {entries.map(({ task, start }, i) => {
            // "Any time" only once, where the timed part of the day ends.
            const firstUntimed = !start && (i === 0 || !!entries[i - 1].start);
            return (
              <li key={task.id} className="grid grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[5.25rem_minmax(0,1fr)]">
                <div className="whitespace-nowrap pr-2.5 pt-[15px] text-right sm:pr-4">
                  {start ? (() => {
                    const { clock, period } = timeParts(start);
                    return (
                      <time dateTime={start.toISOString()} className="font-serif text-[14.5px] leading-none tabular-nums text-ink-secondary">
                        {clock}{period && <span className="ml-0.5 font-sans text-[10px] uppercase tracking-[0.02em] text-ink-faint">{period}</span>}
                      </time>
                    );
                  })() : firstUntimed ? (
                    <span className="text-[11.5px] italic leading-none text-ink-faint">any time</span>
                  ) : null}
                </div>
                <div className="relative min-w-0 border-l border-border pl-3 sm:pl-4">
                  <span aria-hidden="true" className={`absolute -left-[4px] top-[19px] h-[7px] w-[7px] rounded-full ring-2 ring-background ${tickClass(task)}`} />
                  <div className="border-b border-border">{renderRow(task)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11.5px] text-ink-secondary">{label}</dt>
      <dd className="font-serif text-[22px] font-medium leading-none text-foreground">
        {value}
        {note && <span className="ml-1.5 font-sans text-[11.5px] font-normal text-ink-faint">{note}</span>}
      </dd>
    </div>
  );
}
