'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, PencilLine, Plus } from 'lucide-react';
import type { ActivityLike } from '@/lib/activityTime';
import {
  buildTimeSheet,
  projectDays,
  projectTasksOf,
  REFLECTION_PROMPTS,
  type SheetEvent,
  type SheetReflection,
  type SheetStatus,
  type SheetTask,
  type TimeSheet,
} from '@/lib/projectTimeSheet';
import { openReflection } from '@/lib/taskCompletion';

/**
 * "Time management" - the project time sheet from New Feature.pdf, one
 * project and one day per sheet, laid out as the template is: the header
 * (project, date, estimated total duration, priority level, status), the
 * project time tracker (target / actual / difference), the time log (task,
 * start, end, time spent, break), the summary block, and the reflection.
 * Everything but the reflection is filled in from Rune's own records.
 */

interface ProjectLike {
  id: string;
  name: string;
  priority?: string | null;
  color?: string | null;
  status?: string;
}

const MIN_ROWS = 5;

function hm(ms: number, signed = false): string {
  const sign = signed ? (ms > 0 ? '+' : ms < 0 ? '−' : '') : '';
  const total = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
  return `${sign}${body}`;
}

function shiftDay(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function longDate(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function clock(d: Date, tz: string) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** A ticked or empty box, as on the paper template. Read-only: it's filled in from the records. */
function Box({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] tracking-[0.04em] text-foreground">
      <span
        aria-hidden="true"
        className={`grid h-[11px] w-[11px] place-items-center rounded-[2px] border ${on ? 'border-foreground bg-foreground text-background' : 'border-border-strong'}`}
      >
        {on && (
          <svg viewBox="0 0 10 10" className="h-[8px] w-[8px]"><path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      {label}
      {on && <span className="sr-only">(this one)</span>}
    </span>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 ${className}`}>
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[12.5px] tracking-[0.04em] text-foreground">
        <span aria-hidden="true" className="text-[10px]">✦</span>
        {label}
      </span>
      {children}
    </div>
  );
}

function SheetHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center gap-4">
      <h3 id={id} className="shrink-0 text-[13px] font-bold tracking-[0.02em] text-foreground">{children}</h3>
      <span className="h-px flex-1 bg-border-strong" aria-hidden="true" />
    </div>
  );
}

const th = 'border-r border-border px-2 py-2 text-center text-[10.5px] font-normal tracking-[0.06em] text-ink-secondary last:border-r-0';
const td = 'border-r border-border px-2 py-2 text-center text-[13px] tabular-nums text-foreground last:border-r-0';

export function ProjectTimeSheet({
  projects,
  tasks,
  events,
  sessions,
  reflections,
  timezone,
  today,
  initialProjectId,
  initialDate,
}: {
  projects: ProjectLike[];
  tasks: SheetTask[];
  events: SheetEvent[];
  sessions: ActivityLike[];
  reflections: SheetReflection[];
  timezone: string;
  today: string;
  initialProjectId?: string | null;
  initialDate?: string | null;
}) {
  const ordered = useMemo(
    () => [...projects].sort((a, b) => Number(a.status === 'ARCHIVED') - Number(b.status === 'ARCHIVED') || a.name.localeCompare(b.name)),
    [projects]
  );
  const [chosenId, setProjectId] = useState<string>(() => initialProjectId && projects.some(p => p.id === initialProjectId) ? initialProjectId : '');
  // Nothing chosen yet: the first active project.
  const projectId = chosenId || (ordered.find(p => p.status === 'ACTIVE') ?? ordered[0])?.id || '';
  const [date, setDate] = useState<string>(initialDate || today);
  const [historyLimit, setHistoryLimit] = useState(10);

  const project = projects.find(p => p.id === projectId) ?? null;

  const history = useMemo(
    () => (project ? projectDays({ projectId: project.id, tasks, events, sessions, reflections, timezone }) : []),
    [project, tasks, events, sessions, reflections, timezone]
  );

  const sheet: TimeSheet | null = useMemo(
    () => (project ? buildTimeSheet({ project, tasks, events, sessions, reflections, dateStr: date, timezone }) : null),
    [project, tasks, events, sessions, reflections, date, timezone]
  );

  if (projects.length === 0) {
    return <p className="text-[13.5px] text-ink-faint">Create a project and its tasks will fill in a daily time sheet here.</p>;
  }
  if (!project || !sheet) return null;

  const projTasks = projectTasksOf(project.id, tasks);
  const done = projTasks.filter(t => t.status === 'COMPLETED').length;
  const lifetimeMs = history.reduce((s, d) => s + d.focusedMs, 0);
  const workedDays = history.filter(d => d.focusedMs > 0);
  const rows = Math.max(MIN_ROWS, sheet.tracker.length + 1, sheet.log.length);
  const status = sheet.status;
  // The day's finished tasks: each one's reflection can be written or edited here.
  const completedToday = sheet.tracker.filter(r => r.status === 'COMPLETED').map(r => ({ id: r.taskId, name: r.name }));
  const reflectedIds = new Set(sheet.reflections.map(r => r.taskId));

  const s = sheet.summary;
  const summaryRows: Array<[string, React.ReactNode]> = [
    ['Total Focused Time', hm(s.focusedMs)],
    ['Total Break Time', hm(s.breakMs)],
    ['Total Work Duration', hm(s.workMs)],
    ['Efficiency Rate (%)', s.efficiency === null ? '—' : <>{s.efficiency}%<span className="ml-2 text-[12px] text-ink-faint">focused ÷ work duration</span></>],
    [
      'Biggest Time Drain',
      s.biggestDrain
        ? <>{hm(s.biggestDrain.ms)} of brain drain{s.biggestDrain.taskName ? <> during <span className="font-medium">{s.biggestDrain.taskName}</span></> : null}<span className="text-ink-faint">, from {clock(s.biggestDrain.at, timezone)}</span></>
        : sheet.reflections.find(r => r.timeWaster)?.timeWaster ?? <span className="text-ink-faint">None recorded</span>,
    ],
    [
      'Key Productivity Boost',
      s.boost
        ? <>{hm(s.boost.ms)} unbroken{s.boost.taskName ? <> on <span className="font-medium">{s.boost.taskName}</span></> : null}<span className="text-ink-faint">, from {clock(s.boost.at, timezone)}</span></>
        : <span className="text-ink-faint">—</span>,
    ],
    ['Focus Breaks', String(s.focusBreaks)],
  ];

  return (
    <div className="space-y-10">
      {/* Which sheet */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Project"
          value={project.id}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 min-w-0 max-w-full truncate rounded-[9px] border border-border bg-surface px-3 text-[14px] font-medium text-foreground focus:border-border-strong focus:outline-none sm:max-w-[18rem]"
        >
          {ordered.map(p => <option key={p.id} value={p.id}>{p.name}{p.status === 'ARCHIVED' ? ' (archived)' : ''}</option>)}
        </select>
        <div className="flex items-center">
          <button type="button" onClick={() => setDate(shiftDay(date, -1))} className="grid h-9 w-9 place-items-center rounded-[9px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[13.5px] text-foreground tabular-nums focus:border-border-strong focus:outline-none" />
          <button type="button" onClick={() => setDate(shiftDay(date, 1))} className="grid h-9 w-9 place-items-center rounded-[9px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="h-9 rounded-[9px] px-2.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">Today</button>
        )}
        <Link href={`/projects/${project.id}`} className="ml-auto text-[13px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">Open project</Link>
      </div>

      {/* The sheet itself */}
      <article aria-label={`Time management: ${project.name}, ${longDate(date)}`} className="rounded-[14px] border border-border bg-surface px-4 py-6 sm:px-8 sm:py-8" data-testid="time-sheet">
        <h2 className="text-[22px] font-bold tracking-[0.01em] text-foreground">TIME MANAGEMENT</h2>

        <div className="mt-4 grid grid-cols-1 border-y border-border-strong xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]">
          <div className="flex items-center gap-3 border-b border-border py-4 xl:border-b-0 xl:pl-5">
            <span className="text-[15px] tracking-[0.04em] text-foreground">PROJECT</span>
            <span className="text-ink-faint" aria-hidden="true">⁄</span>
            <span className="flex min-w-0 items-center gap-2 text-[16px] font-semibold text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || 'var(--border-strong)' }} aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-x-6">
            <Field label="Date" className="border-b border-border">
              <span className="text-ink-faint" aria-hidden="true">⁄</span>
              <span className="text-[13.5px] font-medium tabular-nums">{longDate(date)}</span>
            </Field>
            <Field label="ESTIMATED TOTAL DURATION" className="border-b border-border">
              <span className="text-ink-faint" aria-hidden="true">⁄</span>
              <span className="text-[13.5px] font-medium tabular-nums" data-testid="sheet-estimate">{sheet.estimatedMs > 0 ? hm(sheet.estimatedMs) : '—'}</span>
            </Field>
            <Field label="PRIORITY LEVEL">
              <span className="flex flex-wrap gap-x-2.5 gap-y-1">
                <Box on={sheet.priority === 'HIGH'} label={sheet.critical ? 'HIGH (CRITICAL)' : 'HIGH'} />
                <Box on={sheet.priority === 'MEDIUM'} label="MEDIUM" />
                <Box on={sheet.priority === 'LOW'} label="LOW" />
              </span>
            </Field>
            <Field label="STATUS">
              <span className="flex flex-wrap gap-x-2.5 gap-y-1" data-testid="sheet-status">
                {(['IN_PROGRESS', 'COMPLETED', 'PENDING'] as SheetStatus[]).map(v => (
                  <Box key={v} on={status === v} label={v === 'IN_PROGRESS' ? 'IN PROGRESS' : v} />
                ))}
              </span>
            </Field>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
          {/* Project time tracker */}
          <section aria-labelledby="sheet-tracker">
            <SheetHeading id="sheet-tracker">PROJECT TIME TRACKER</SheetHeading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse" data-testid="sheet-tracker">
                <thead>
                  <tr className="bg-surface-sunken">
                    <th className={`${th} w-[40%]`}>PROJECT</th>
                    <th className={th}>TARGET TIME</th>
                    <th className={th}>ACTUAL TIME</th>
                    <th className={th}>DIFFERENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.tracker.map(r => (
                    <tr key={r.taskId} className="border-b border-border">
                      <td className={`${td} !text-left`}>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{r.name}</span>
                          {r.status === 'COMPLETED' && <span className="shrink-0 text-[11px] text-ink-faint">done</span>}
                        </span>
                      </td>
                      <td className={td}>{r.targetMs > 0 ? hm(r.targetMs) : '—'}</td>
                      <td className={td}>{hm(r.actualMs)}</td>
                      <td className={`${td} text-ink-secondary`}>{r.targetMs > 0 ? hm(r.diffMs, true) : '—'}</td>
                    </tr>
                  ))}
                  {sheet.tracker.length > 0 && (
                    <tr className="border-b border-border-strong">
                      <td className={`${td} !text-left font-semibold`}>{project.name} · total</td>
                      <td className={`${td} font-semibold`}>{sheet.trackerTotal.targetMs > 0 ? hm(sheet.trackerTotal.targetMs) : '—'}</td>
                      <td className={`${td} font-semibold`} data-testid="sheet-actual-total">{hm(sheet.trackerTotal.actualMs)}</td>
                      <td className={`${td} font-semibold`}>{sheet.trackerTotal.targetMs > 0 ? hm(sheet.trackerTotal.diffMs, true) : '—'}</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, rows - sheet.tracker.length - (sheet.tracker.length > 0 ? 1 : 0)) }, (_, i) => (
                    <tr key={`pad-${i}`} className="border-b border-border" aria-hidden="true">
                      <td className={td}>{i === 0 && sheet.tracker.length === 0 ? <span className="text-[12.5px] text-ink-faint">No tasks planned or worked on this day</span> : ' '}</td>
                      <td className={td} /><td className={td} /><td className={td} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Time log */}
          <section aria-labelledby="sheet-log">
            <SheetHeading id="sheet-log">TIME LOG</SheetHeading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse" data-testid="sheet-log">
                <thead>
                  <tr className="bg-surface-sunken">
                    <th className={`${th} w-[37%]`}>TASK</th>
                    <th className={th}>START</th>
                    <th className={th}>END</th>
                    <th className={th}>TIME SPENT</th>
                    <th className={th}>BREAK</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.log.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className={`${td} !text-left`}><span className="block truncate">{r.name}</span></td>
                      <td className={td}>{r.start ? clock(r.start, timezone) : '—'}</td>
                      <td className={td}>{r.ongoing ? <span className="text-ink-secondary">now</span> : r.end ? clock(r.end, timezone) : '—'}</td>
                      <td className={td}>{hm(r.spentMs)}</td>
                      <td className={td}>
                        {r.breakMs > 0 ? hm(r.breakMs) : r.drainMs > 0 ? '' : '—'}
                        {r.drainMs > 0 && <span className="block text-[11px] text-ink-faint">{hm(r.drainMs)} drain</span>}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, rows - sheet.log.length) }, (_, i) => (
                    <tr key={`pad-${i}`} className="border-b border-border" aria-hidden="true">
                      <td className={td}>{i === 0 && sheet.log.length === 0 ? <span className="text-[12.5px] text-ink-faint">No work logged</span> : ' '}</td>
                      <td className={td} /><td className={td} /><td className={td} /><td className={td} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Summary (the template's second "Project time tracker") */}
          <section aria-labelledby="sheet-summary">
            <SheetHeading id="sheet-summary">PROJECT TIME TRACKER</SheetHeading>
            <table className="w-full border-collapse border-t border-border" data-testid="sheet-summary">
              <tbody>
                {summaryRows.map(([label, value]) => (
                  <tr key={label} className="border-b border-border">
                    <th scope="row" className="w-[40%] border-r border-border px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-ink-secondary">{label}</th>
                    <td className="px-3.5 py-2.5 text-[13.5px] text-foreground tabular-nums">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Reflection */}
          <section aria-labelledby="sheet-reflection">
            <SheetHeading id="sheet-reflection">REFLECTION</SheetHeading>
            <ol data-testid="sheet-reflection">
              {REFLECTION_PROMPTS.map((p, i) => {
                const answers = sheet.reflections.filter(r => r[p.key]);
                return (
                  <li key={p.key} className="border-b border-border py-2.5">
                    <p className="text-[12.5px] font-semibold text-foreground">{i + 1}. {p.label} :</p>
                    {answers.map(r => (
                      <p key={r.taskId} className="mt-0.5 text-[13.5px] leading-snug text-foreground">
                        {r[p.key]}
                        {sheet.reflections.length > 1 && <span className="ml-1.5 text-[12px] text-ink-faint">— {r.taskName}</span>}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
            {completedToday.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-ink-faint">Written when finishing:</span>
                {completedToday.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openReflection(t)}
                    className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-border px-2 text-[12.5px] text-ink-secondary hover:border-border-strong hover:text-foreground"
                  >
                    {reflectedIds.has(t.id) ? <PencilLine className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
                    <span className="max-w-[12rem] truncate">{t.name}</span>
                    <span className="sr-only">{reflectedIds.has(t.id) ? '(edit reflection)' : '(add reflection)'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-ink-faint">You’ll be asked these when you finish one of this project’s tasks.</p>
            )}
          </section>
        </div>
      </article>

      {/* Across the project's life */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="project-overview">
          <h3 id="project-overview" className="mb-3 text-[13px] font-semibold text-ink-secondary">{project.name} so far</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              [hm(lifetimeMs), 'focused, all time'],
              [String(workedDays.length), workedDays.length === 1 ? 'day worked' : 'days worked'],
              [`${done} of ${projTasks.length}`, 'tasks done'],
              [workedDays.length ? hm(lifetimeMs / workedDays.length) : '—', 'per day worked'],
            ].map(([v, l]) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="mt-1 text-[12.5px] text-ink-secondary">{l}</dt>
                <dd className="font-serif text-[24px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="project-history">
          <h3 id="project-history" className="mb-1 text-[13px] font-semibold text-ink-secondary">Daily records</h3>
          {history.length === 0 ? (
            <p className="text-[13px] text-ink-faint">No work recorded on this project yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, historyLimit).map(d => {
                const max = Math.max(...history.map(x => x.focusedMs), 1);
                return (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => setDate(d.date)}
                      aria-current={d.date === date ? 'date' : undefined}
                      className={`grid w-full grid-cols-[7.5rem_1fr_auto] items-center gap-3 rounded-[6px] px-1.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-sunken ${d.date === date ? 'bg-surface-sunken font-medium' : ''}`}
                    >
                      <span className="text-ink-secondary tabular-nums">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${(d.focusedMs / max) * 100}%`, backgroundColor: project.color || 'var(--time-work)' }} />
                      </span>
                      <span className="text-right tabular-nums text-foreground">
                        {hm(d.focusedMs)}
                        {d.completed > 0 && <span className="ml-2 text-[12px] text-ink-faint">{d.completed} done</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {history.length > historyLimit && (
            <button type="button" onClick={() => setHistoryLimit(n => n + 20)} className="mt-2 text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
              Show earlier days
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
