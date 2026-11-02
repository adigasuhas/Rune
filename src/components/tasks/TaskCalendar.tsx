'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, monthGrid, monthOf, plannedHours, shiftMonth, type CalendarEntry } from '@/app/tasks/taskCalendar';
import type { Task } from '@/app/tasks/types';

/**
 * Month view of the Tasks page: every planned task on its day, in the same
 * ledger look as the week strip (serif day numbers, quiet ink, one accent).
 *
 * The grid is for overview; picking a day hands over to the ordinary task
 * list below, which keeps every action. Each cell shows up to three tasks
 * (time, then name) with a priority tick, then "+N more"; phones get dots.
 * The top-right figure is the day's planned hours, so a heavy day reads at
 * a glance.
 *
 * Keyboard: one tab stop (the focused day); arrow keys move a day or a
 * week, Page Up/Down a month, Home/End the week's ends, Enter picks.
 */

const MAX_CHIPS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const labelDate = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });

function tickClass(task: Task): string {
  if (task.status === 'COMPLETED') return 'bg-border';
  if (task.status === 'IN_PROGRESS') return 'bg-primary';
  if (task.status === 'BLOCKED') return 'bg-[var(--color-data-slate)]';
  if (task.priority === 'CRITICAL') return 'bg-danger';
  if (task.priority === 'HIGH') return 'bg-warning';
  return 'bg-border-strong';
}

function chipTextClass(task: Task): string {
  if (task.status === 'COMPLETED') return 'text-ink-faint line-through decoration-ink-faint/60';
  if (task.status === 'IN_PROGRESS') return 'text-primary font-medium';
  if (task.status === 'BLOCKED') return 'text-[var(--color-data-slate)]';
  return 'text-foreground';
}

function formatHours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

interface Props {
  month: string; // YYYY-MM
  onMonthChange: (month: string) => void;
  entriesByDay: Record<string, CalendarEntry<Task>[]>;
  timezone: string;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (key: string) => void;
  onOpenTask: (task: Task, dayKey: string) => void;
}

export function TaskCalendar({ month, onMonthChange, entriesByDay, timezone, todayKey, selectedDate, onSelectDate, onOpenTask }: Props) {
  const weeks = React.useMemo(() => monthGrid(month), [month]);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [lastFocus, setFocusKey] = React.useState<string | null>(null);
  const pendingFocus = React.useRef(false);
  // The roving tab stop always sits in the month on screen: the day last
  // moved to, else the picked day, else today, else the 1st.
  const focusKey =
    lastFocus && monthOf(lastFocus) === month ? lastFocus
    : selectedDate && monthOf(selectedDate) === month ? selectedDate
    : monthOf(todayKey) === month ? todayKey
    : `${month}-01`;

  // Move real focus only after a keyboard move (never on render or click).
  React.useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusKey}"]`)?.focus();
  }, [focusKey, weeks]);

  const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timezone });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in steps) next = addDays(focusKey, steps[e.key]);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const target = shiftMonth(monthOf(focusKey), e.key === 'PageUp' ? -1 : 1);
      const lastDay = new Date(Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)).getUTCDate();
      next = `${target}-${String(Math.min(Number(focusKey.slice(8, 10)), lastDay)).padStart(2, '0')}`;
    } else if (e.key === 'Home' || e.key === 'End') {
      const weekday = (new Date(`${focusKey}T12:00:00Z`).getUTCDay() + 6) % 7;
      next = addDays(focusKey, e.key === 'Home' ? -weekday : 6 - weekday);
    }
    if (!next) return;
    e.preventDefault();
    pendingFocus.current = true;
    setFocusKey(next);
    if (monthOf(next) !== month) onMonthChange(monthOf(next));
  };

  const monthTitle = labelDate(`${month}-01`, { month: 'long', year: 'numeric' });

  return (
    <section aria-label="Task calendar" className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          className="grid h-8 w-8 place-items-center text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-[8px] transition-colors"
          title="Previous month" aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="min-w-[10.5rem] text-center font-serif text-[21px] font-medium tracking-[-0.01em] text-foreground" aria-live="polite">
          {monthTitle}
        </h2>
        <button
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          className="grid h-8 w-8 place-items-center text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-[8px] transition-colors"
          title="Next month" aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {month !== monthOf(todayKey) && (
          <button onClick={() => onMonthChange(monthOf(todayKey))} className="ml-1 text-[13px] text-ink-secondary hover:text-foreground transition-colors">
            This month
          </button>
        )}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={monthTitle}
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-[12px] border border-border bg-border"
      >
        <div role="row" className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((d, i) => (
            <div key={d} role="columnheader" aria-label={WEEKDAYS_LONG[i]} className="bg-surface px-2 py-1.5 text-[11.5px] text-ink-secondary">
              <span className="sm:hidden">{d.slice(0, 1)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].key} role="row" className="mt-px grid grid-cols-7 gap-px">
            {week.map((day) => {
              const entries = entriesByDay[day.key] ?? [];
              const open = entries.filter((e) => e.task.status !== 'COMPLETED').length;
              const hours = plannedHours(entries);
              const isToday = day.key === todayKey;
              const isSelected = day.key === selectedDate;
              const extra = entries.length - MAX_CHIPS;
              const dayLabel = labelDate(day.key, { weekday: 'long', month: 'long', day: 'numeric' });
              const summary = entries.length === 0
                ? 'no tasks'
                : `${entries.length} ${entries.length === 1 ? 'task' : 'tasks'}${entries.length - open ? `, ${entries.length - open} done` : ''}${hours ? `, ${formatHours(hours)} planned` : ''}`;
              return (
                <div
                  key={day.key}
                  role="gridcell"
                  aria-selected={isSelected}
                  className={`group/cell relative flex min-h-[56px] flex-col gap-0.5 p-1 sm:min-h-[118px] sm:p-1.5 transition-colors ${
                    isSelected ? 'bg-surface-raised' : day.inMonth ? 'bg-surface hover:bg-surface-raised/60' : 'bg-surface-sunken/60'
                  }`}
                >
                  {isSelected && <span aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_var(--color-foreground)]" />}
                  <div className="flex items-start justify-between gap-1">
                    <button
                      data-day={day.key}
                      tabIndex={day.key === focusKey ? 0 : -1}
                      onClick={() => { setFocusKey(day.key); onSelectDate(day.key); }}
                      aria-label={`${dayLabel}${isToday ? ', today' : ''}: ${summary}`}
                      aria-current={isToday ? 'date' : undefined}
                      className={`grid h-7 min-w-7 place-items-center rounded-full px-1 font-serif text-[15px] font-medium leading-none tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isToday
                          ? 'bg-foreground text-background'
                          : day.inMonth
                            ? 'text-foreground hover:bg-surface-sunken'
                            : 'text-ink-faint hover:bg-surface-sunken'
                      }`}
                    >
                      {day.day}
                    </button>
                    {hours > 0 && (
                      <span aria-hidden="true" className={`hidden pt-1 pr-0.5 text-[11px] tabular-nums sm:inline ${open ? 'text-ink-secondary' : 'text-ink-faint'}`}>
                        {formatHours(hours)}
                      </span>
                    )}
                  </div>

                  {/* Wide screens: the first few tasks by name. Mouse shortcuts
                      only - the day button (and the list it opens) is the
                      keyboard and screen-reader path to every task. */}
                  <ul className="hidden min-w-0 flex-col gap-px sm:flex" aria-hidden="true">
                    {entries.slice(0, MAX_CHIPS).map(({ task, start }) => (
                      <li key={task.id} className="min-w-0">
                        <button
                          tabIndex={-1}
                          onClick={() => { setFocusKey(day.key); onOpenTask(task, day.key); }}
                          title={`${task.name}${start ? ` · ${timeLabel(start)}` : ''}`}
                          className="flex w-full min-w-0 items-center gap-1.5 rounded-[4px] py-[2px] pl-1 pr-1 text-left text-[12px] leading-[1.35] hover:bg-surface-sunken"
                        >
                          <span className={`h-3 w-[2.5px] shrink-0 rounded-full ${tickClass(task)}`} />
                          {start && <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">{timeLabel(start)}</span>}
                          <span className={`truncate ${chipTextClass(task)}`}>{task.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {extra > 0 && (
                    <button
                      tabIndex={-1}
                      aria-hidden="true"
                      onClick={() => { setFocusKey(day.key); onSelectDate(day.key); }}
                      className="hidden self-start rounded-[4px] px-1 py-px text-[11.5px] text-ink-secondary hover:bg-surface-sunken hover:text-foreground sm:block"
                    >
                      +{extra} more
                    </button>
                  )}

                  {/* Phones: a dot per task (up to four), in the same colours. */}
                  {entries.length > 0 && (
                    <div aria-hidden="true" className="mt-auto flex flex-wrap gap-[3px] px-1 pb-0.5 sm:hidden">
                      {entries.slice(0, 4).map(({ task }) => (
                        <span key={task.id} className={`h-[5px] w-[5px] rounded-full ${tickClass(task)}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-faint sm:flex" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-danger" />Critical</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-warning" />High</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-primary" />In progress</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-[var(--color-data-slate)]" />Blocked</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-border" />Done</span>
        <span className="ml-auto">Hours are the day&rsquo;s planned estimates. Pick a day to see and edit its tasks below.</span>
      </p>
    </section>
  );
}
