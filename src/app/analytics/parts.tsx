'use client';

import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useUiPreference } from '@/lib/useUiPreference';

/**
 * The pieces Analytics is built from, in the Projects page's language: ruled
 * rows instead of boxed cards, serif figures, sentence-case labels, quiet ink.
 */

export const prefKey = (id: string) => `analytics.open.${id}`;

/**
 * A section that can be folded away. Its summary stays visible when closed,
 * so a folded section still says what's in it. Open/closed is remembered on
 * the person's account (useUiPreference), and the fold animates only when
 * reduced motion isn't asked for.
 */
export function AnalyticsSection({
  id,
  title,
  summary,
  defaultOpen = true,
  actions,
  children,
}: {
  id: string;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useUiPreference<boolean>(prefKey(id), defaultOpen);
  const bodyId = useId();
  return (
    <section aria-labelledby={`${bodyId}-title`} data-section={id} data-open={open} className="scroll-mt-6 border-t border-border-strong">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group -ml-1.5 flex min-w-0 flex-1 basis-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:basis-auto"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-[var(--duration-standard)] motion-reduce:transition-none group-hover:text-foreground ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <h2 id={`${bodyId}-title`} className="shrink-0 text-[16px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {summary && <span className="min-w-0 truncate pl-2 text-[13.5px] text-ink-secondary">{summary}</span>}
        </button>
        {open && actions && <div className="flex shrink-0 items-center gap-2 pl-5 sm:pl-0">{actions}</div>}
      </div>
      <div
        id={bodyId}
        className={`grid transition-[grid-template-rows,opacity,visibility] duration-[var(--duration-modal)] ease-[var(--ease-out)] motion-reduce:transition-none ${open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'}`}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-9 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** One figure in a ruled strip: label above, value below - the project page's "facts" row. */
export function Fact({ label, children, sub, testId }: { label: string; children: React.ReactNode; sub?: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 py-3.5 lg:px-4 lg:first:pl-0">
      <dt className="truncate text-[12.5px] text-ink-secondary">{label}</dt>
      <dd className="mt-1 font-serif text-[24px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums" data-testid={testId}>{children}</dd>
      {sub && <dd className="mt-1.5 truncate text-[12px] text-ink-secondary tabular-nums">{sub}</dd>}
    </div>
  );
}

export function Facts({ children, cols = 'lg:grid-cols-5', label }: { children: React.ReactNode; cols?: string; label?: string }) {
  return (
    <dl aria-label={label} className={`grid grid-cols-2 gap-x-6 border-y border-border sm:grid-cols-3 ${cols} lg:gap-x-0 lg:divide-x lg:divide-border`}>
      {children}
    </dl>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[9px] border border-border bg-surface-sunken p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-7 rounded-[7px] px-2.5 text-[13px] transition-colors ${value === v ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:text-foreground'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function dayLabel(ymd: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });
}

/**
 * One value per day as thin bars on a baseline, with a tooltip on hover or
 * focus and a label per bar for screen readers. `max` fixes the top of the
 * scale (e.g. 100 for a percentage).
 */
export function DayBars({
  days,
  values,
  format,
  color = 'var(--primary)',
  max,
  height = 112,
  label,
  emptyDays,
}: {
  days: string[];
  values: number[];
  format: (v: number) => string;
  color?: string;
  max?: number;
  height?: number;
  label: string;
  /** Days with nothing to measure (e.g. no tasks planned): drawn as a dot, read as "nothing planned". */
  emptyDays?: Set<string>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? Math.max(...values, 0) * 1.1;
  const scale = top > 0 ? top : 1;
  return (
    <div className="relative" role="group" aria-label={label}>
      <div className="flex items-end gap-1 border-b border-border-strong sm:gap-1.5" style={{ height }} onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const v = values[i] || 0;
          const empty = emptyDays?.has(d);
          return (
            <button
              key={d}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' })}: ${empty ? 'nothing planned' : format(v)}`}
              className="group relative flex h-full flex-1 flex-col justify-end focus-visible:outline-none"
            >
              <span className={`absolute inset-x-[-2px] inset-y-0 rounded-[4px] transition-colors ${hover === i ? 'bg-surface-sunken' : ''} group-focus-visible:ring-2 group-focus-visible:ring-ring/40`} aria-hidden="true" />
              {empty ? (
                <span className="relative mx-auto mb-1 block h-1 w-1 rounded-full bg-border-strong" aria-hidden="true" />
              ) : (
                <span
                  className="relative mx-auto block w-full max-w-[34px] rounded-t-[4px]"
                  style={{ height: v > 0 ? `${Math.max(2, (v / scale) * 100)}%` : 2, backgroundColor: v > 0 ? color : 'var(--border-c)' }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5" aria-hidden="true">
        {days.map((d, i) => (
          <span key={d} className="flex-1 text-center text-[11px] text-ink-faint tabular-nums">
            {days.length <= 8 ? dayLabel(d, { weekday: 'narrow' }) : i % 2 === (days.length - 1) % 2 ? dayLabel(d, { day: 'numeric' }) : ''}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute -top-2 z-10 w-40 -translate-y-full rounded-[10px] border border-border bg-surface px-2.5 py-2 text-[12px] shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / days.length) * 100}% - 5rem), calc(100% - 10rem))` }}
        >
          <p className="font-semibold text-foreground">{dayLabel(days[hover], { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="text-ink-secondary tabular-nums">{emptyDays?.has(days[hover]) ? 'Nothing planned' : format(values[hover] || 0)}</p>
        </div>
      )}
    </div>
  );
}

/** A labelled horizontal share, e.g. "Critical 80%". */
export function ShareRow({ label, pct, count, color = 'var(--primary)' }: { label: string; pct: number; count?: string; color?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 py-1.5 text-[13px]">
      <span className="truncate text-ink-secondary">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
      </span>
      <span className="w-20 text-right tabular-nums text-foreground">{count ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}
