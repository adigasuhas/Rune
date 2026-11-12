'use client';

import React, { useMemo, useState } from 'react';
import { accountDays, type ActivityLike, type DayAccount } from '@/lib/activityTime';

/**
 * Where the active day went: working time, breaks, and brain drain.
 *
 *   Active hours = working + break + brain drain
 *
 * Working hours never include a break or a stretch of brain drain, even one
 * inside a work slot, and no moment is counted twice. Breaks are shown as
 * what they are - part of a sustainable day - not as lost time.
 */

const RANGES = [
  { id: 'day', label: 'Today', days: 1 },
  { id: 'week', label: '7 days', days: 7 },
  { id: 'month', label: '30 days', days: 30 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const SERIES = [
  { key: 'workingMs', label: 'Working', color: 'var(--time-work)' },
  { key: 'breakMs', label: 'Break', color: 'var(--time-break)' },
  { key: 'drainMs', label: 'Brain drain', color: 'var(--time-drain)' },
] as const;

const H = 3_600_000;

function hm(ms: number): string {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function back(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(ymd: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });
}

export function ActiveHours({
  tasks,
  events,
  sessions,
  timezone,
  today,
  onEditTimes,
}: {
  tasks: Array<{ date: string | Date } & Record<string, unknown>>;
  events: Array<{ start: string | Date } & Record<string, unknown>>;
  sessions: ActivityLike[];
  timezone: string;
  today: string;
  onEditTimes: () => void;
}) {
  const [range, setRange] = useState<RangeId>('week');
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const strip = useMemo(() => Array.from({ length: 14 }, (_, i) => back(today, 13 - i)), [today]);
  const allDays = useMemo(() => Array.from({ length: 30 }, (_, i) => back(today, 29 - i)), [today]);
  const accounts = useMemo(
    () => accountDays(Array.from(new Set([...allDays, ...strip])), tasks, events, sessions, timezone),
    [allDays, strip, tasks, events, sessions, timezone]
  );

  const span = RANGES.find(r => r.id === range)!.days;
  const inRange = allDays.slice(-span);
  const total = inRange.reduce<DayAccount>(
    (s, d) => {
      const a = accounts.get(d);
      if (!a) return s;
      return { workingMs: s.workingMs + a.workingMs, breakMs: s.breakMs + a.breakMs, drainMs: s.drainMs + a.drainMs, activeMs: s.activeMs + a.activeMs, breaks: s.breaks + a.breaks, drains: s.drains + a.drains };
    },
    { workingMs: 0, breakMs: 0, drainMs: 0, activeMs: 0, breaks: 0, drains: 0 }
  );
  const share = total.activeMs > 0 ? Math.round((total.workingMs / total.activeMs) * 100) : null;
  const maxDay = Math.max(H, ...strip.map(d => accounts.get(d)?.activeMs || 0));
  const niceMax = Math.ceil(maxDay / H) * H;
  const hovered = hover ? accounts.get(hover) : null;

  return (
    <section aria-labelledby="active-hours-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="active-hours-title" className="font-display text-base font-bold tracking-tight text-foreground">Where your active time went</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
            Active hours are working time plus breaks and brain drain. Breaks are part of a sustainable day, and neither is ever counted as work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Range" className="flex rounded-[9px] border border-border bg-surface-sunken p-0.5">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={range === r.id}
                onClick={() => setRange(r.id)}
                className={`h-7 rounded-[7px] px-2.5 text-[13px] transition-colors ${range === r.id ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:text-foreground'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onEditTimes} className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">
            Add or fix times
          </button>
        </div>
      </div>

      {/* The figures: active total, then what it's made of */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-border py-5 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col-reverse md:col-span-1">
          <dt className="mt-1.5 text-[13px] text-ink-secondary">Total active hours</dt>
          <dd className="font-serif text-[40px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums" data-testid="active-total">{hm(total.activeMs)}</dd>
        </div>
        {SERIES.map(s => (
          <div key={s.key} className="flex flex-col-reverse">
            <dt className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-secondary">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.key === 'workingMs' ? 'Total working hours' : s.key === 'breakMs' ? 'Break time' : 'Brain drain'}
            </dt>
            <dd className="font-serif text-[26px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums" data-testid={`active-${s.key}`}>{hm(total[s.key])}</dd>
          </div>
        ))}
      </dl>

      {/* One proportional bar for the range */}
      {total.activeMs > 0 ? (
        <div>
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={SERIES.map(s => `${s.label} ${hm(total[s.key])}`).join(', ')}>
            {SERIES.map(s => total[s.key] > 0 && (
              <div key={s.key} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(total[s.key] / total.activeMs) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${hm(total[s.key])}`} />
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-secondary">
            {share !== null && <><span className="font-medium text-foreground tabular-nums">{share}%</span> of your active time was focused work</>}
            {total.breaks > 0 && <> · {total.breaks} {total.breaks === 1 ? 'break' : 'breaks'}</>}
          </p>
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-faint">Nothing tracked in this range yet. Tick off a task’s slot, or use Step away on Today when you take a break.</p>
      )}

      {/* Last 14 days, one stacked bar per day */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold text-ink-secondary">The last 14 days</h3>
          <div className="flex items-center gap-4">
            <ul className="flex items-center gap-3 text-[12px] text-ink-secondary" aria-label="Legend">
              {SERIES.map(s => (
                <li key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.color }} aria-hidden="true" />{s.label}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowTable(v => !v)} className="text-[12px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
              {showTable ? 'Show chart' : 'Show as table'}
            </button>
          </div>
        </div>

        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-border text-[12px] text-ink-faint">
                  <th className="py-2 font-medium">Day</th>
                  {SERIES.map(s => <th key={s.key} className="py-2 text-right font-medium">{s.label}</th>)}
                  <th className="py-2 text-right font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...strip].reverse().map(d => {
                  const a = accounts.get(d)!;
                  return (
                    <tr key={d}>
                      <td className="py-1.5 text-ink-secondary">{dayLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      {SERIES.map(s => <td key={s.key} className="py-1.5 text-right">{hm(a[s.key])}</td>)}
                      <td className="py-1.5 text-right font-medium text-foreground">{hm(a.activeMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative">
            <div className="relative flex h-40 items-end gap-1.5 border-b border-border-strong sm:gap-2.5" onMouseLeave={() => setHover(null)}>
              {/* recessive gridlines at whole hours */}
              {Array.from({ length: Math.min(niceMax / H, 12) }, (_, i) => (
                <div key={i} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${((i + 1) * H / niceMax) * 100}%` }} />
              ))}
              {strip.map(d => {
                const a = accounts.get(d)!;
                const label = dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' });
                return (
                  <button
                    key={d}
                    type="button"
                    onMouseEnter={() => setHover(d)}
                    onFocus={() => setHover(d)}
                    onBlur={() => setHover(null)}
                    aria-label={`${label}: ${SERIES.map(s => `${s.label} ${hm(a[s.key])}`).join(', ')}`}
                    className="group relative flex h-full flex-1 flex-col justify-end focus-visible:outline-none"
                  >
                    <span className={`absolute inset-x-[-3px] inset-y-0 rounded-[4px] transition-colors ${hover === d ? 'bg-surface-sunken' : ''} group-focus-visible:ring-2 group-focus-visible:ring-ring/40`} aria-hidden="true" />
                    <span className="relative flex flex-col-reverse gap-[2px]" style={{ height: `${(a.activeMs / niceMax) * 100}%` }}>
                      {SERIES.map(s => a[s.key] > 0 && (
                        <span key={s.key} className="block w-full first:rounded-b-[2px] last:rounded-t-[4px]" style={{ flexGrow: a[s.key], backgroundColor: s.color, minHeight: 2 }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5 sm:gap-2.5" aria-hidden="true">
              {strip.map((d, i) => (
                <span key={d} className="flex-1 text-center text-[11px] text-ink-faint tabular-nums">
                  {i % 2 === 1 || d === today ? dayLabel(d, { day: 'numeric' }) : ''}
                </span>
              ))}
            </div>
            <span className="absolute -top-1 right-0 text-[11px] text-ink-faint tabular-nums" aria-hidden="true">{niceMax / H}h</span>
            {hover && hovered && (
              <div role="tooltip" className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-[10px] border border-border bg-surface p-2.5 text-[12px] shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]" style={{ left: `clamp(0px, calc(${(strip.indexOf(hover) + 0.5) / strip.length * 100}% - 5.5rem), calc(100% - 11rem))` }}>
                <p className="mb-1 font-semibold text-foreground">{dayLabel(hover, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                {SERIES.map(s => (
                  <p key={s.key} className="flex items-center justify-between gap-2 text-ink-secondary">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.color }} />{s.label}</span>
                    <span className="tabular-nums text-foreground">{hm(hovered[s.key])}</span>
                  </p>
                ))}
                <p className="mt-1 flex justify-between border-t border-border pt-1 font-medium text-foreground"><span>Active</span><span className="tabular-nums">{hm(hovered.activeMs)}</span></p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
