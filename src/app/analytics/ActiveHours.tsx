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

/** Totals over the last `days` of `accounts` (newest last). */
export function sumAccounts(accounts: Map<string, DayAccount>, days: string[]): DayAccount {
  return days.reduce<DayAccount>(
    (s, d) => {
      const a = accounts.get(d);
      if (!a) return s;
      return { workingMs: s.workingMs + a.workingMs, breakMs: s.breakMs + a.breakMs, drainMs: s.drainMs + a.drainMs, activeMs: s.activeMs + a.activeMs, breaks: s.breaks + a.breaks, drains: s.drains + a.drains };
    },
    { workingMs: 0, breakMs: 0, drainMs: 0, activeMs: 0, breaks: 0, drains: 0 }
  );
}

export const ACTIVE_RANGES = RANGES;
export type ActiveRange = RangeId;

/** The last 30 days ending `today`, oldest first: what ActiveHours reads. */
export function last30(today: string) {
  return Array.from({ length: 30 }, (_, i) => back(today, 29 - i));
}

/** Per-day accounts for the last 30 days, built once and shared. */
export function useActiveAccounts(tasks: TaskIn, events: EventIn, sessions: ActivityLike[], timezone: string, today: string) {
  return useMemo(() => accountDays(last30(today), tasks, events, sessions, timezone), [tasks, events, sessions, timezone, today]);
}

type TaskIn = Array<{ date: string | Date } & Record<string, unknown>>;
type EventIn = Array<{ start: string | Date } & Record<string, unknown>>;

export function ActiveHours({
  accounts,
  today,
  range,
  onRange,
  series = 'all',
  onEditTimes,
}: {
  accounts: Map<string, DayAccount>;
  today: string;
  range: RangeId;
  onRange: (r: RangeId) => void;
  /** 'away' shows only breaks and brain drain (Activity). */
  series?: 'all' | 'away';
  onEditTimes?: () => void;
}) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const strip = useMemo(() => Array.from({ length: 14 }, (_, i) => back(today, 13 - i)), [today]);
  const allDays = useMemo(() => last30(today), [today]);
  const SHOWN = series === 'away' ? SERIES.filter(x => x.key !== 'workingMs') : SERIES;
  const span = RANGES.find(r => r.id === range)!.days;
  const inRange = allDays.slice(-span);
  const total = sumAccounts(accounts, inRange);
  const share = total.activeMs > 0 ? Math.round((total.workingMs / total.activeMs) * 100) : null;
  const shownMs = (a: DayAccount | undefined) => (a ? SHOWN.reduce((x, k) => x + a[k.key], 0) : 0);
  const maxDay = Math.max(series === 'away' ? H / 2 : H, ...strip.map(d => shownMs(accounts.get(d))));
  const step = maxDay <= H ? H / 4 : H;
  const niceMax = Math.ceil(maxDay / step) * step;
  const hovered = hover ? accounts.get(hover) : null;
  const awayMs = total.breakMs + total.drainMs;
  const shownTotal = series === 'away' ? awayMs : total.activeMs;
  const fmtStep = (ms: number) => (ms >= H ? `${ms / H}h` : `${Math.round(ms / 60000)}m`);

  const figures: Array<{ key: string; label: string; value: string; color?: string; big?: boolean; testId: string }> =
    series === 'away'
      ? [
          { key: 'awayMs', label: 'Breaks and brain drain', value: hm(awayMs), big: true, testId: 'away-total' },
          { key: 'breakMs', label: 'Break time', value: hm(total.breakMs), color: 'var(--time-break)', testId: 'away-breakMs' },
          { key: 'drainMs', label: 'Brain drain', value: hm(total.drainMs), color: 'var(--time-drain)', testId: 'away-drainMs' },
          { key: 'count', label: 'Breaks taken', value: String(total.breaks), testId: 'away-breaks' },
        ]
      : [
          { key: 'activeMs', label: 'Total active hours', value: hm(total.activeMs), big: true, testId: 'active-total' },
          { key: 'workingMs', label: 'Total working hours', value: hm(total.workingMs), color: 'var(--time-work)', testId: 'active-workingMs' },
          { key: 'breakMs', label: 'Break time', value: hm(total.breakMs), color: 'var(--time-break)', testId: 'active-breakMs' },
          { key: 'drainMs', label: 'Brain drain', value: hm(total.drainMs), color: 'var(--time-drain)', testId: 'active-drainMs' },
        ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-relaxed text-ink-secondary">
          {series === 'away'
            ? 'Breaks are part of a sustainable day. Neither breaks nor brain drain count as work; both count toward your active hours.'
            : 'Active hours are working time plus breaks and brain drain. A break taken in the middle of a task isn’t counted as work.'}
        </p>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Range" className="flex rounded-[9px] border border-border bg-surface-sunken p-0.5">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={range === r.id}
                onClick={() => onRange(r.id)}
                className={`h-7 rounded-[7px] px-2.5 text-[13px] transition-colors ${range === r.id ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:text-foreground'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {onEditTimes && (
            <button type="button" onClick={onEditTimes} className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">
              Log or fix times
            </button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 border-y border-border md:grid-cols-[1.35fr_1fr_1fr_1fr] md:gap-x-0 md:divide-x md:divide-border">
        {figures.map(f => (
          <div key={f.key} className="flex flex-col-reverse py-4 md:px-5 md:first:pl-0">
            <dt className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-secondary">
              {f.color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: f.color }} aria-hidden="true" />}
              {f.label}
            </dt>
            <dd className={`font-serif font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums ${f.big ? 'text-[36px]' : 'text-[24px]'}`} data-testid={f.testId}>{f.value}</dd>
          </div>
        ))}
      </dl>

      {shownTotal > 0 ? (
        <div>
          <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={SHOWN.map(x => `${x.label} ${hm(total[x.key])}`).join(', ')}>
            {SHOWN.map(x => total[x.key] > 0 && (
              <div key={x.key} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(total[x.key] / shownTotal) * 100}%`, backgroundColor: x.color }} title={`${x.label}: ${hm(total[x.key])}`} />
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-secondary">
            {series === 'away'
              ? <>{total.activeMs > 0 ? <><span className="font-medium text-foreground tabular-nums">{Math.round((awayMs / total.activeMs) * 100)}%</span> of your active time</> : null}{total.drains > 0 && <> · brain drain logged {total.drains} {total.drains === 1 ? 'time' : 'times'}</>}</>
              : <>{share !== null && <><span className="font-medium text-foreground tabular-nums">{share}%</span> of your active time was focused work</>}{total.breaks > 0 && <> · {total.breaks} {total.breaks === 1 ? 'break' : 'breaks'}</>}</>}
          </p>
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-faint">
          {series === 'away' ? 'No breaks or brain drain recorded in this range.' : 'Nothing tracked in this range yet. Tick off a task’s slot, or use Step away on Today when you take a break.'}
        </p>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold text-ink-secondary">The last 14 days</h3>
          <div className="flex items-center gap-4">
            <ul className="flex items-center gap-3 text-[12px] text-ink-secondary" aria-label="Legend">
              {SHOWN.map(x => (
                <li key={x.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: x.color }} aria-hidden="true" />{x.label}</li>
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
                  {SHOWN.map(x => <th key={x.key} className="py-2 text-right font-medium">{x.label}</th>)}
                  <th className="py-2 text-right font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...strip].reverse().map(d => {
                  const a = accounts.get(d)!;
                  return (
                    <tr key={d}>
                      <td className="py-1.5 text-ink-secondary">{dayLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      {SHOWN.map(x => <td key={x.key} className="py-1.5 text-right">{hm(a[x.key])}</td>)}
                      <td className="py-1.5 text-right font-medium text-foreground">{hm(a.activeMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative">
            <div className="relative flex h-36 items-end gap-1.5 border-b border-border-strong sm:gap-2.5" onMouseLeave={() => setHover(null)}>
              {Array.from({ length: Math.min(Math.round(niceMax / step), 12) }, (_, i) => (
                <div key={i} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(((i + 1) * step) / niceMax) * 100}%` }} />
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
                    aria-label={`${label}: ${SHOWN.map(x => `${x.label} ${hm(a[x.key])}`).join(', ')}`}
                    className="group relative flex h-full flex-1 flex-col justify-end focus-visible:outline-none"
                  >
                    <span className={`absolute inset-x-[-3px] inset-y-0 rounded-[4px] transition-colors ${hover === d ? 'bg-surface-sunken' : ''} group-focus-visible:ring-2 group-focus-visible:ring-ring/40`} aria-hidden="true" />
                    <span className="relative flex flex-col-reverse gap-[2px]" style={{ height: `${(shownMs(a) / niceMax) * 100}%` }}>
                      {SHOWN.map(x => a[x.key] > 0 && (
                        <span key={x.key} className="block w-full first:rounded-b-[2px] last:rounded-t-[4px]" style={{ flexGrow: a[x.key], backgroundColor: x.color, minHeight: 2 }} />
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
            <span className="absolute -top-1 right-0 text-[11px] text-ink-faint tabular-nums" aria-hidden="true">{fmtStep(niceMax)}</span>
            {hover && hovered && (
              <div role="tooltip" className="pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-[10px] border border-border bg-surface p-2.5 text-[12px] shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]" style={{ left: `clamp(0px, calc(${(strip.indexOf(hover) + 0.5) / strip.length * 100}% - 5.5rem), calc(100% - 11rem))` }}>
                <p className="mb-1 font-semibold text-foreground">{dayLabel(hover, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                {SHOWN.map(x => (
                  <p key={x.key} className="flex items-center justify-between gap-2 text-ink-secondary">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: x.color }} />{x.label}</span>
                    <span className="tabular-nums text-foreground">{hm(hovered[x.key])}</span>
                  </p>
                ))}
                <p className="mt-1 flex justify-between border-t border-border pt-1 font-medium text-foreground"><span>Active</span><span className="tabular-nums">{hm(hovered.activeMs)}</span></p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
