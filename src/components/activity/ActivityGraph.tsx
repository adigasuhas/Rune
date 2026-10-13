'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dailyActivity, dayOfWeek, firstActiveDay, formatHours, LEVEL_BOUNDS, mondayOf, rangeStart, recentWeeksStart, RECENT_WEEKS_DEFAULT, summarize, type DayActivity } from '@/lib/activity';

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Rune's year of work, one cell per day, shaded by time worked.
 *
 * Not a streak counter: no "missed day" red, no badges, nothing that
 * reads as a score. Empty days are simply quiet. The words underneath
 * describe patterns, and hovering (or arrowing through with the keyboard)
 * shows that day's time and how many tasks were completed.
 *
 * `compact` is the Today version: the last ~5 months, no period picker.
 */
type AnyTask = { date: string | Date; status?: string } & Record<string, unknown>;
type AnyEvent = { start: string | Date } & Record<string, unknown>;

const GAP = 3;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LEVEL_BG = [
  'var(--surface-sunken)',
  'color-mix(in srgb, var(--primary) 26%, var(--surface-sunken))',
  'color-mix(in srgb, var(--primary) 48%, var(--surface-sunken))',
  'color-mix(in srgb, var(--primary) 74%, var(--surface-sunken))',
  'var(--primary)',
];

// One formatter for every cell's label (a year is ~370 of them per render).
let longFmt: Intl.DateTimeFormat | null = null;
function longDate(ymd: string) {
  longFmt ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return longFmt.format(new Date(`${ymd}T12:00:00Z`));
}

export function ActivityGraph({
  tasks,
  events,
  timezone,
  today,
  compact = false,
  footer,
  memberSince,
}: {
  tasks: AnyTask[];
  events: AnyEvent[];
  timezone: string;
  today: string; // YYYY-MM-DD in the user's zone
  compact?: boolean;
  footer?: React.ReactNode;
  /** The day the account was created (YYYY-MM-DD) - compact mode never starts before it. */
  memberSince?: string | null;
}) {
  // Periods: the last 12 months, plus every calendar year that has any data.
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const t of tasks) { const y = String(typeof t.date === 'string' ? t.date : t.date?.toISOString?.()).slice(0, 4); if (/^\d{4}$/.test(y)) ys.add(y); }
    return [...ys].sort().reverse();
  }, [tasks]);
  const [period, setPeriod] = useState<'last' | string>('last');

  const LABEL_W = 28;
  const MIN_CELL = 10;
  // Measure first, then decide how many weeks fit: the graph is never
  // scrolled sideways. Wide: the whole period. Narrow: the most recent
  // weeks that fit at a readable size.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitWeeks = boxW ? Math.max(4, Math.floor((boxW - LABEL_W + GAP) / (MIN_CELL + GAP))) : compact ? RECENT_WEEKS_DEFAULT : 53;
  // Compact (Today): an adaptive range - see recentWeeksStart.
  const compactStart = useMemo(
    () => (compact ? recentWeeksStart({ today, memberSince, firstActivity: firstActiveDay(tasks, events, timezone, today) }) : null),
    [compact, today, memberSince, tasks, events, timezone]
  );
  const wantWeeks = compactStart ? Math.floor((Date.parse(`${mondayOf(today)}T12:00:00Z`) - Date.parse(`${compactStart}T12:00:00Z`)) / 604_800_000) + 1 : 53;
  const shownWeeks = Math.min(wantWeeks, fitWeeks);

  const { days } = useMemo(() => {
    let end = today;
    let start: string;
    if (compactStart) {
      // The adaptive start, or as many recent weeks as fit on a narrow screen.
      const fitStart = addDaysYmd(mondayOf(today), -7 * (shownWeeks - 1));
      start = fitStart > compactStart ? fitStart : compactStart;
    } else if (compact || period === 'last') start = rangeStart(today, shownWeeks);
    else {
      end = period === today.slice(0, 4) ? today : `${period}-12-31`;
      const yearStart = rangeStart(`${period}-01-07`, 1); // the Monday on or before 1 January
      const fitStart = rangeStart(end, shownWeeks);
      start = fitStart > yearStart ? fitStart : yearStart;
    }
    return { days: dailyActivity(tasks, events, timezone, start, end) };
  }, [tasks, events, timezone, today, period, shownWeeks, compact, compactStart]);

  const summary = useMemo(() => summarize(days.filter((d) => period === 'last' || compact || d.date.startsWith(period))), [days, period, compact]);

  // Columns are weeks (Monday first).
  const weeks: (DayActivity | null)[][] = [];
  days.forEach((d, i) => {
    const row = (dayOfWeek(d.date) + 6) % 7;
    if (i === 0 || row === 0) weeks.push(Array(7).fill(null));
    weeks[weeks.length - 1][row] = d;
  });
  const monthLabels: { col: number; label: string }[] = [];
  weeks.forEach((w, c) => {
    const first = w.find(Boolean);
    if (!first) return;
    const m = Number(first.date.slice(5, 7)) - 1;
    const prev = c > 0 ? weeks[c - 1].find(Boolean) : null;
    const last = monthLabels[monthLabels.length - 1];
    if ((!prev || Number(prev.date.slice(5, 7)) - 1 !== m) && (!last || c - last.col >= 3)) monthLabels.push({ col: c, label: MONTHS_SHORT[m] });
  });

  const [active, setActive] = useState<number | null>(null);
  const activeDay = active != null ? days[active] : null;
  const activeCol = activeDay ? weeks.findIndex((w) => w.includes(activeDay)) : -1;
  const activeRow = activeDay ? (dayOfWeek(activeDay.date) + 6) % 7 : -1;

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    setActive((a) => Math.min(days.length - 1, Math.max(0, (a ?? days.length - 1) + map[e.key])));
  };

  const CELL = boxW ? Math.max(MIN_CELL, Math.min(compact ? 13 : 16, Math.floor((boxW - LABEL_W + GAP) / weeks.length - GAP))) : 11;
  const width = weeks.length * (CELL + GAP) - GAP;
  const trimmed = !compact && shownWeeks < wantWeeks;

  return (
    <div ref={boxRef} className="min-w-0">
      {!compact && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <p className="text-[15px] text-ink-secondary">
            <span className="font-serif text-[26px] font-medium tracking-[-0.02em] text-foreground tabular-nums">{formatHours(summary.totalHours)}</span>{' '}
            {period === 'last' ? 'worked in the last year' : `worked in ${period}`}
          </p>
          <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
            <span className="sr-only">Period</span>
            <select value={period} onChange={(e) => { setPeriod(e.target.value); setActive(null); }} className="h-8 rounded-[8px] border border-border-strong bg-surface px-2 text-[13px] text-foreground">
              <option value="last">Last 12 months</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="relative pb-1">
        <div className="relative" style={{ width: width + LABEL_W, paddingTop: 18 }}>
          {monthLabels.filter((m) => m.col * (CELL + GAP) + 24 <= width).map((m) => (
            <span key={`${m.col}-${m.label}`} className="absolute top-0 text-[11.5px] text-ink-faint" style={{ left: LABEL_W + m.col * (CELL + GAP) }}>{m.label}</span>
          ))}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <span key={d} className="absolute left-0 text-[11px] leading-none text-ink-faint" style={{ top: 18 + (i * 2) * (CELL + GAP) + Math.max(0, (CELL - 11) / 2) + 1 }}>{d}</span>
          ))}
          <div
            role="grid"
            tabIndex={0}
            aria-label={`Daily working time, ${summary.daysWorked} days with recorded work. Use the arrow keys to move between days.`}
            onKeyDown={onKey}
            onFocus={() => setActive((a) => a ?? days.length - 1)}
            onBlur={() => setActive(null)}
            onMouseLeave={() => setActive(null)}
            className="flex rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            style={{ gap: GAP, marginLeft: LABEL_W }}
          >
            {weeks.map((w, c) => (
              <div key={c} role="row" className="flex flex-col" style={{ gap: GAP }}>
                {w.map((d, r) => {
                  if (!d) return <span key={r} style={{ width: CELL, height: CELL }} />;
                  const idx = days.indexOf(d);
                  const on = idx === active;
                  return (
                    <span
                      key={r}
                      role="gridcell"
                      aria-label={`${longDate(d.date)}: ${d.hours ? formatHours(d.hours) : 'no recorded work'}`}
                      onMouseEnter={() => setActive(idx)}
                      className="rounded-[3px] transition-transform duration-100"
                      style={{ width: CELL, height: CELL, background: LEVEL_BG[d.level], outline: on ? '1.5px solid var(--text)' : undefined, outlineOffset: 1, transform: on ? 'scale(1.15)' : undefined, boxShadow: d.date === today ? 'inset 0 0 0 1px color-mix(in srgb, var(--text) 45%, transparent)' : undefined }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {activeDay && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 w-max -translate-x-1/2 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]"
              style={{ left: Math.min(Math.max(LABEL_W + activeCol * (CELL + GAP) + CELL / 2, 112), LABEL_W + width - 112), top: 18 + (activeRow + 1) * (CELL + GAP) + 4 }}
            >
              <p className="font-semibold text-foreground">{longDate(activeDay.date)}</p>
              <p className="mt-0.5 text-foreground">{activeDay.hours ? `${formatHours(activeDay.hours)} of focused work` : 'No recorded work'}</p>
              {activeDay.completed > 0 && <p className="text-ink-secondary">{activeDay.completed} {activeDay.completed === 1 ? 'task' : 'tasks'} completed</p>}
            </div>
          )}
        </div>
      </div>

      {compact && summary.totalHours === 0 && (
        <p className="mt-2 text-[12.5px] text-ink-secondary">Nothing tracked yet. These weeks fill in as you complete tasks and calendar blocks.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12px] text-ink-faint">
        {footer ?? <span>{trimmed ? `The last ${shownWeeks} weeks fit here; widen the window for the full year. ` : ''}Time from completed calendar blocks and timed tasks.</span>}
        <span className="flex items-center gap-1.5" aria-hidden="true">
          Less
          {LEVEL_BG.map((bg, i) => (
            <span key={i} title={i === 0 ? 'No recorded work' : i < 4 ? `Under ${LEVEL_BOUNDS[i - 1]}h` : `${LEVEL_BOUNDS[2]}h or more`} className="inline-block rounded-[3px]" style={{ width: CELL, height: CELL, background: bg }} />
          ))}
          More
        </span>
      </div>

      {!compact && summary.lines.length > 0 && (
        <ul className="mt-6 mb-2 grid gap-x-8 gap-y-2 border-t border-border pt-5 text-[14px] text-ink-secondary sm:grid-cols-2">
          {summary.lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
