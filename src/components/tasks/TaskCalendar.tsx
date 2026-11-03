'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, monthGrid, monthOf, plannedHours, shiftMonth, type CalendarEntry } from '@/app/tasks/taskCalendar';
import type { Task } from '@/app/tasks/types';
import { DAY_KIND_LABEL, DAY_KIND_SHORT, formatHours, intensityLevel, isWeekend, type DayKind } from '@/lib/timeOff';

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
 * Each day of the month is tinted by its kind (working, weekly off, leave,
 * sick leave, other, not available) and the tint deepens with the hours
 * worked that day, against the length of the working day - so the month
 * reads as a heat map of where the time went. Leave, sick and other days
 * also say so in words, so colour is never the only cue.
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

export interface DayInfo {
  kind: DayKind;
  reason: string;
  /** Hours worked that day (Analytics' "hours worked": slots and tasks marked done). */
  worked: number;
}

const KIND_ORDER: DayKind[] = ['working', 'weeklyOff', 'leave', 'sick', 'other', 'unavailable'];

interface Props {
  month: string; // YYYY-MM
  onMonthChange: (month: string) => void;
  entriesByDay: Record<string, CalendarEntry<Task>[]>;
  timezone: string;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (key: string) => void;
  onOpenTask: (task: Task, dayKey: string) => void;
  /** Kind and hours worked per day; days missing here read as ordinary working days. */
  dayInfo?: Record<string, DayInfo>;
  /** Length of the working day in hours, the scale for the shading. */
  dayHours?: number;
}

export function TaskCalendar({ month, onMonthChange, entriesByDay, timezone, todayKey, selectedDate, onSelectDate, onOpenTask, dayInfo = {}, dayHours = 8 }: Props) {
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
              const info = dayInfo[day.key];
              const kind: DayKind = info?.kind ?? (isWeekend(day.key) ? 'weeklyOff' : 'working');
              const worked = info?.worked ?? 0;
              const level = intensityLevel(worked, dayHours);
              // A weekend that's simply the weekend needs no label; anything
              // set on purpose (or not a working day midweek) says what it is.
              const showKind = kind !== 'working' && !(kind === 'weeklyOff' && isWeekend(day.key) && !info?.reason);
              const kindText = `${DAY_KIND_LABEL[kind]}${info?.reason ? ` (${info.reason})` : ''}`;
              const summary = [
                kindText,
                entries.length === 0
                  ? 'no tasks'
                  : `${entries.length} ${entries.length === 1 ? 'task' : 'tasks'}${entries.length - open ? `, ${entries.length - open} done` : ''}${hours ? `, ${formatHours(hours)} planned` : ''}`,
                ...(worked > 0 ? [`${formatHours(worked)} worked`] : []),
              ].join(', ');
              return (
                <div
                  key={day.key}
                  role="gridcell"
                  aria-selected={isSelected}
                  data-day-kind={day.inMonth ? kind : undefined}
                  data-level={day.inMonth ? level : undefined}
                  title={day.inMonth ? `${kindText}${worked > 0 ? ` · ${formatHours(worked)} worked` : ''}` : undefined}
                  className={`group/cell relative flex min-h-[56px] flex-col gap-0.5 p-1 sm:min-h-[118px] sm:p-1.5 ${
                    day.inMonth ? 'day-tint day-tint-hover' : 'bg-surface-sunken/60'
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
                      <span aria-hidden="true" className={`hidden pt-1 pr-0.5 text-[11px] tabular-nums sm:inline ${open || level >= 2 ? 'text-ink-secondary' : 'text-ink-faint'}`}>
                        {formatHours(hours)}
                      </span>
                    )}
                  </div>
                  {day.inMonth && showKind && (
                    <span aria-hidden="true" className="day-text flex min-w-0 items-center gap-1 px-1 text-[10px] font-semibold leading-none sm:text-[11px]">
                      <span className="day-ink hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block" />
                      <span className="shrink-0">{DAY_KIND_SHORT[kind]}</span>
                      {info?.reason && <span className="hidden min-w-0 truncate font-normal sm:inline">· {info.reason}</span>}
                    </span>
                  )}

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
                          {start && <span className={`shrink-0 text-[11px] tabular-nums ${level >= 2 ? 'text-ink-secondary' : 'text-ink-faint'}`}>{timeLabel(start)}</span>}
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

                  {day.inMonth && worked > 0 && (
                    <span aria-hidden="true" className="mt-auto hidden self-end pr-0.5 text-[11px] font-medium tabular-nums text-ink-secondary sm:block">
                      {formatHours(worked)} worked
                    </span>
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

      <div aria-hidden="true" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[12px] text-ink-secondary">
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          {KIND_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span data-day-kind={k} data-level={k === 'unavailable' ? undefined : 1} className="day-tint h-3.5 w-3.5 rounded-[4px] shadow-[inset_0_0_0_1px_var(--border-c)]" />
              {DAY_KIND_LABEL[k]}
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1.5 sm:ml-auto">
          <span>Hours worked</span>
          <span className="text-ink-faint">less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} data-day-kind="working" data-level={l} className="day-tint h-3.5 w-3.5 rounded-[4px] shadow-[inset_0_0_0_1px_var(--border-c)]" />
          ))}
          <span className="text-ink-faint">more</span>
          <span className="text-ink-faint">· full at {formatHours(dayHours * 0.75)}+</span>
        </span>
      </div>

      <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-faint sm:flex" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-danger" />Critical</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-warning" />High</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-primary" />In progress</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-[var(--color-data-slate)]" />Blocked</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2.5px] rounded-full bg-border" />Done</span>
        <span className="ml-auto">Top right: hours planned. Pick a day to see and edit its tasks below.</span>
      </p>
    </section>
  );
}
