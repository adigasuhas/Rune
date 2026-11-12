'use client';

import React from 'react';
import { PencilLine, Plus } from 'lucide-react';
import { REFLECTION_PROMPTS, type SheetStatus, type TimeSheet } from '@/lib/projectTimeSheet';
import { openReflection } from '@/lib/taskCompletion';

/**
 * "Time management" - the project time sheet from the reference template
 * (New Feature.pdf), one project and one day: the header (project, date,
 * estimated total duration, priority level, status), the project time
 * tracker (target / actual / difference), the time log (task, start, end,
 * time spent, break), the summary block and the reflection. Everything but
 * the reflection is filled in from Rune's own records (buildTimeSheet).
 *
 * Laid out to fit one desktop screen (about 1440x900) without scrolling:
 * tight ruled rows, the template's 2x2 arrangement, and long reflection
 * answers clamped to two lines (the Reflections section shows them in full).
 * Below the `lg` breakpoint the four blocks stack.
 */

const MIN_ROWS = 4;

export function hm(ms: number, signed = false): string {
  const sign = signed ? (ms > 0 ? '+' : ms < 0 ? '−' : '') : '';
  const total = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
  return `${sign}${body}`;
}

export function longDate(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function clock(d: Date, tz: string) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** A ticked or empty box, as on the paper template. Read-only: filled in from the records. */
function Box({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] tracking-[0.04em] text-foreground">
      <span aria-hidden="true" className={`grid h-[11px] w-[11px] place-items-center rounded-[2px] border ${on ? 'border-foreground bg-foreground text-background' : 'border-border-strong'}`}>
        {on && <svg viewBox="0 0 10 10" className="h-[8px] w-[8px]"><path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      {label}
      {on && <span className="sr-only">(this one)</span>}
    </span>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 py-2 ${className}`}>
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] tracking-[0.05em] text-foreground">
        <span aria-hidden="true" className="text-[9px]">✦</span>
        {label}
      </span>
      {children}
    </div>
  );
}

function SheetHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <h3 id={id} className="shrink-0 text-[12px] font-bold tracking-[0.03em] text-foreground">{children}</h3>
      <span className="h-px flex-1 bg-border-strong" aria-hidden="true" />
    </div>
  );
}

const th = 'whitespace-nowrap border-r border-border px-1.5 py-1.5 text-center text-[10px] font-normal tracking-[0.05em] text-ink-secondary last:border-r-0';
const td = 'whitespace-nowrap border-r border-border px-1.5 py-[5px] text-center text-[12.5px] tabular-nums text-foreground last:border-r-0';

export function ProjectTimeSheet({
  project,
  sheet,
  timezone,
}: {
  project: { id: string; name: string; color?: string | null };
  sheet: TimeSheet;
  timezone: string;
}) {
  const rows = Math.max(MIN_ROWS, sheet.tracker.length + (sheet.tracker.length > 0 ? 1 : 0), sheet.log.length);
  const completedToday = sheet.tracker.filter(r => r.status === 'COMPLETED').map(r => ({ id: r.taskId, name: r.name }));
  const reflectedIds = new Set(sheet.reflections.map(r => r.taskId));
  const s = sheet.summary;

  const summaryRows: Array<[string, React.ReactNode]> = [
    ['Total Focused Time', hm(s.focusedMs)],
    ['Total Break Time', hm(s.breakMs)],
    ['Total Work Duration', hm(s.workMs)],
    ['Efficiency Rate (%)', s.efficiency === null ? '—' : <>{s.efficiency}%<span className="ml-2 text-[11.5px] text-ink-secondary">focused ÷ work duration</span></>],
    [
      'Biggest Time Drain',
      s.biggestDrain
        ? <>{hm(s.biggestDrain.ms)} of brain drain{s.biggestDrain.taskName ? <> during <span className="font-medium">{s.biggestDrain.taskName}</span></> : null}<span className="text-ink-secondary">, {clock(s.biggestDrain.at, timezone)}</span></>
        : sheet.reflections.find(r => r.timeWaster)?.timeWaster ?? <span className="text-ink-secondary">None recorded</span>,
    ],
    [
      'Key Productivity Boost',
      s.boost
        ? <>{hm(s.boost.ms)} unbroken{s.boost.taskName ? <> on <span className="font-medium">{s.boost.taskName}</span></> : null}<span className="text-ink-secondary">, {clock(s.boost.at, timezone)}</span></>
        : <span className="text-ink-secondary">—</span>,
    ],
    ['Focus Breaks', String(s.focusBreaks)],
  ];

  return (
    <article aria-label={`Time management: ${project.name}, ${longDate(sheet.date)}`} className="rounded-[12px] border border-border bg-surface px-4 py-3.5 sm:px-6" data-testid="time-sheet">
      <h2 className="text-[17px] font-bold tracking-[0.01em] text-foreground">TIME MANAGEMENT</h2>

      <div className="mt-2.5 grid grid-cols-1 border-y border-border-strong xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.7fr)]">
        <div className="flex min-w-0 items-center gap-2.5 border-b border-border py-2.5 xl:border-b-0 xl:pl-3">
          <span className="text-[13px] tracking-[0.05em] text-foreground">PROJECT</span>
          <span className="text-ink-faint" aria-hidden="true">⁄</span>
          <span className="flex min-w-0 items-center gap-2 text-[14.5px] font-semibold text-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color || 'var(--border-strong)' }} aria-hidden="true" />
            <span className="truncate">{project.name}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-x-5">
          <Field label="Date" className="border-b border-border">
            <span className="text-ink-faint" aria-hidden="true">⁄</span>
            <span className="text-[12.5px] font-medium tabular-nums">{longDate(sheet.date)}</span>
          </Field>
          <Field label="ESTIMATED TOTAL DURATION" className="border-b border-border">
            <span className="text-ink-faint" aria-hidden="true">⁄</span>
            <span className="text-[12.5px] font-medium tabular-nums" data-testid="sheet-estimate">{sheet.estimatedMs > 0 ? hm(sheet.estimatedMs) : '—'}</span>
          </Field>
          <Field label="PRIORITY LEVEL">
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              <Box on={sheet.priority === 'HIGH'} label={sheet.critical ? 'HIGH (CRITICAL)' : 'HIGH'} />
              <Box on={sheet.priority === 'MEDIUM'} label="MEDIUM" />
              <Box on={sheet.priority === 'LOW'} label="LOW" />
            </span>
          </Field>
          <Field label="STATUS">
            <span className="flex flex-wrap gap-x-2 gap-y-1" data-testid="sheet-status">
              {(['IN_PROGRESS', 'COMPLETED', 'PENDING'] as SheetStatus[]).map(v => (
                <Box key={v} on={sheet.status === v} label={v === 'IN_PROGRESS' ? 'IN PROGRESS' : v} />
              ))}
            </span>
          </Field>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
        <section aria-labelledby={`tracker-${project.id}`}>
          <SheetHeading id={`tracker-${project.id}`}>PROJECT TIME TRACKER</SheetHeading>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse" data-testid="sheet-tracker">
              <thead>
                <tr className="bg-surface-sunken">
                  <th className={`${th} w-full`}>PROJECT</th>
                  <th className={th}>TARGET TIME</th>
                  <th className={th}>ACTUAL TIME</th>
                  <th className={th}>DIFFERENCE</th>
                </tr>
              </thead>
              <tbody>
                {sheet.tracker.map(r => (
                  <tr key={r.taskId} className="border-b border-border">
                    <td className={`${td} max-w-0 !text-left`}>
                      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <span className="truncate" title={r.name}>{r.name}</span>
                        {r.status === 'COMPLETED' && <span className="shrink-0 text-[11px] text-ink-secondary">done</span>}
                      </span>
                    </td>
                    <td className={td}>{r.targetMs > 0 ? hm(r.targetMs) : '—'}</td>
                    <td className={td}>{hm(r.actualMs)}</td>
                    <td className={`${td} text-ink-secondary`}>{r.targetMs > 0 ? hm(r.diffMs, true) : '—'}</td>
                  </tr>
                ))}
                {sheet.tracker.length > 0 && (
                  <tr className="border-b border-border-strong">
                    <td className={`${td} max-w-0 !text-left font-semibold`}>Total</td>
                    <td className={`${td} font-semibold`}>{sheet.trackerTotal.targetMs > 0 ? hm(sheet.trackerTotal.targetMs) : '—'}</td>
                    <td className={`${td} font-semibold`} data-testid="sheet-actual-total">{hm(sheet.trackerTotal.actualMs)}</td>
                    <td className={`${td} font-semibold`}>{sheet.trackerTotal.targetMs > 0 ? hm(sheet.trackerTotal.diffMs, true) : '—'}</td>
                  </tr>
                )}
                {Array.from({ length: Math.max(0, rows - sheet.tracker.length - (sheet.tracker.length > 0 ? 1 : 0)) }, (_, i) => (
                  <tr key={`pad-${i}`} className="border-b border-border" aria-hidden="true">
                    <td className={`${td} max-w-0 truncate`}>{i === 0 && sheet.tracker.length === 0 ? <span className="text-[12px] text-ink-secondary">No tasks planned or worked on</span> : ' '}</td>
                    <td className={td} /><td className={td} /><td className={td} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby={`log-${project.id}`}>
          <SheetHeading id={`log-${project.id}`}>TIME LOG</SheetHeading>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse" data-testid="sheet-log">
              <thead>
                <tr className="bg-surface-sunken">
                  <th className={`${th} w-full`}>TASK</th>
                  <th className={th}>START</th>
                  <th className={th}>END</th>
                  <th className={th}>TIME SPENT</th>
                  <th className={th}>BREAK</th>
                </tr>
              </thead>
              <tbody>
                {sheet.log.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className={`${td} max-w-0 !text-left`}><span className="block truncate" title={r.name}>{r.name}</span></td>
                    <td className={td}>{r.start ? clock(r.start, timezone) : '—'}</td>
                    <td className={td}>{r.ongoing ? <span className="text-ink-secondary">now</span> : r.end ? clock(r.end, timezone) : '—'}</td>
                    <td className={td}>{hm(r.spentMs)}</td>
                    <td className={td}>
                      {r.breakMs > 0 ? hm(r.breakMs) : r.drainMs > 0 ? '' : '—'}
                      {r.drainMs > 0 && <span className={`${r.breakMs > 0 ? 'ml-1' : ''} text-[11px] text-ink-secondary`} title={`${hm(r.drainMs)} of brain drain`}>+{hm(r.drainMs)} drain</span>}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, rows - sheet.log.length) }, (_, i) => (
                  <tr key={`pad-${i}`} className="border-b border-border" aria-hidden="true">
                    <td className={`${td} max-w-0 truncate`}>{i === 0 && sheet.log.length === 0 ? <span className="text-[12px] text-ink-secondary">No work logged</span> : ' '}</td>
                    <td className={td} /><td className={td} /><td className={td} /><td className={td} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby={`summary-${project.id}`}>
          <SheetHeading id={`summary-${project.id}`}>PROJECT TIME TRACKER</SheetHeading>
          <table className="w-full border-collapse border-t border-border" data-testid="sheet-summary">
            <tbody>
              {summaryRows.map(([label, value]) => (
                <tr key={label} className="border-b border-border">
                  <th scope="row" className="w-[40%] border-r border-border px-3 py-[5px] text-left text-[12px] font-semibold text-ink-secondary">{label}</th>
                  <td className="px-3 py-[5px] text-[12.5px] leading-snug text-foreground tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby={`reflection-${project.id}`}>
          <SheetHeading id={`reflection-${project.id}`}>REFLECTION</SheetHeading>
          <ol data-testid="sheet-reflection">
            {REFLECTION_PROMPTS.map((p, i) => {
              const answers = sheet.reflections.filter(r => r[p.key]);
              return (
                <li key={p.key} className="flex min-w-0 items-baseline gap-2 border-b border-border py-[5px]">
                  <span className="shrink-0 text-[12px] font-semibold text-foreground">{i + 1}. {p.label} :</span>
                  <span className="line-clamp-2 min-w-0 text-[12.5px] leading-snug text-foreground" title={answers.map(r => r[p.key]).join(' · ') || undefined}>
                    {answers.map((r, j) => (
                      <React.Fragment key={r.taskId}>
                        {j > 0 && <span className="text-ink-secondary"> · </span>}
                        {r[p.key]}
                        {sheet.reflections.length > 1 && <span className="text-[11.5px] text-ink-secondary"> ({r.taskName})</span>}
                      </React.Fragment>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          {completedToday.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-ink-secondary">Finished:</span>
              {completedToday.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openReflection(t)}
                  className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-border px-1.5 text-[12px] text-ink-secondary hover:border-border-strong hover:text-foreground"
                >
                  {reflectedIds.has(t.id) ? <PencilLine className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
                  <span className="max-w-[10rem] truncate">{t.name}</span>
                  <span className="sr-only">{reflectedIds.has(t.id) ? '(edit reflection)' : '(add reflection)'}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-ink-secondary">You’ll be asked these when you finish one of this project’s tasks.</p>
          )}
        </section>
      </div>
    </article>
  );
}
