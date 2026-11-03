'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { monthGrid, monthOf, shiftMonth } from '@/app/tasks/taskCalendar';
import {
  DAY_KIND_LABEL,
  DAY_KIND_SHORT,
  DAY_TYPES,
  clearDayTypes,
  countLeave,
  dateRange,
  dayKind,
  dayTypeOf,
  formatHours,
  isWeekend,
  leaveWindow,
  parseDayEntries,
  setDayTypes,
  workdayHours,
  type DayKind,
  type DayType,
  type LeavePeriod,
} from '@/lib/timeOff';

/**
 * Settings -> Schedule and time off. Four parts, top to bottom:
 *   1. the working day, drawn on a 24-hour rule with the deep-work window;
 *   2. the dates you're available (either end open);
 *   3. leave and sick-leave allowances, and what's left of them;
 *   4. a month of days, each tinted by its kind, to mark leave, sick days
 *      and the rest - one day, or a range at once.
 * Parts 1-3 save with the page's "Save changes"; a day change applies at
 * once (onApplyDays), as it always has.
 */

export interface ScheduleValue {
  workStart: string;
  workEnd: string;
  deepWorkStart: string;
  deepWorkEnd: string;
  deepWorkMaxSession: number;
  leaveAllowance: number | null;
  sickLeaveAllowance: number | null;
  leaveAllowancePer: LeavePeriod;
  availableFrom: string | null;
  availableUntil: string | null;
}

interface Props {
  value: ScheduleValue;
  onChange: (patch: Partial<ScheduleValue>) => void;
  workingDays: string;
  /** Saves a new Setting.workingDays; resolves false when it didn't save. */
  onApplyDays: (next: string) => Promise<boolean>;
  timezone: string;
  todayKey: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fieldCls =
  'h-10 w-full rounded-[9px] border border-border-strong bg-surface px-3 text-[14px] text-foreground tabular-nums transition-colors hover:border-ink-faint/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25';

const labelDate = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });

function Part({ id, step, title, hint, children }: { id: string; step: string; title: string; hint: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-5 border-t border-border pt-7 first:border-t-0 first:pt-0 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      <div className="max-w-prose">
        <p className="font-serif text-[13px] italic text-ink-faint">{step}</p>
        <h3 id={id} className="mt-0.5 font-serif text-[20px] font-medium leading-tight tracking-[-0.01em] text-foreground">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary text-pretty">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, children, note }: { label: string; htmlFor: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-ink-secondary">{label}</label>
      {children}
      {note && <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">{note}</p>}
    </div>
  );
}

const toMin = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** [left%, width%] segments for a span on the 24-hour rule, split at midnight. */
function spans(start: string, end: string): Array<[number, number]> {
  const a = toMin(start);
  const b = toMin(end);
  const pct = (m: number) => (m / 1440) * 100;
  if (b > a) return [[pct(a), pct(b - a)]];
  if (b === a) return [];
  return [[pct(a), pct(1440 - a)], [0, pct(b)]];
}

function nowMinutes(timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  } catch {
    return null;
  }
}

/** The working day and the deep-work window on one 24-hour rule. */
function DayRule({ value, timezone }: { value: ScheduleValue; timezone: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(nowMinutes(timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  const hours = workdayHours(value.workStart, value.workEnd);
  const deep = workdayHours(value.deepWorkStart, value.deepWorkEnd);
  return (
    <figure className="rounded-[12px] border border-border bg-surface px-4 pb-3 pt-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-ink-secondary">
        <span><span className="font-serif text-[22px] font-medium text-foreground tabular-nums">{formatHours(hours)}</span> working day</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-[2px] bg-primary" />{formatHours(deep)} for deep work, in sessions up to {value.deepWorkMaxSession || 90} min</span>
      </figcaption>
      <div className="relative h-9 overflow-hidden rounded-[8px] bg-surface-sunken" aria-hidden="true">
        {[6, 12, 18].map((h) => (
          <span key={h} className="absolute inset-y-0 w-px bg-border" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {spans(value.workStart, value.workEnd).map(([l, w], i) => (
          <span key={`w${i}`} className="absolute inset-y-0 bg-primary-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]" style={{ left: `${l}%`, width: `${w}%` }} />
        ))}
        {spans(value.deepWorkStart, value.deepWorkEnd).map(([l, w], i) => (
          <span key={`d${i}`} className="absolute inset-y-[11px] rounded-full bg-primary" style={{ left: `${l}%`, width: `${w}%` }} />
        ))}
        {now !== null && (
          <span className="absolute inset-y-0 w-[2px] bg-foreground" style={{ left: `calc(${(now / 1440) * 100}% - 1px)` }} />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-ink-faint tabular-nums" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className={`absolute ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <p className="sr-only">
        Working day {value.workStart} to {value.workEnd}, {formatHours(hours)}. Deep work {value.deepWorkStart} to {value.deepWorkEnd}.
      </p>
    </figure>
  );
}

/** One allowance: what's left, as a figure and a meter in the kind's colour. */
function Allowance({ id, kind, title, allowance, used, windowLabel, onChange }: {
  id: string;
  kind: DayKind;
  title: string;
  allowance: number | null;
  used: number;
  windowLabel: string;
  onChange: (n: number | null) => void;
}) {
  const left = allowance !== null ? allowance - used : null;
  const fill = allowance ? Math.min(used / allowance, 1) : 0;
  return (
    <div data-day-kind={kind} className="flex min-w-0 flex-col rounded-[12px] border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <span className="day-ink h-2.5 w-2.5 rounded-full" />
        {title}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5" aria-live="polite">
        <span className={`font-serif text-[34px] font-medium leading-none tabular-nums ${left !== null && left < 0 ? 'text-danger' : 'text-foreground'}`}>
          {left !== null ? Math.abs(left) : used}
        </span>
        <span className="text-[13px] text-ink-secondary">
          {left === null ? `${used === 1 ? 'day' : 'days'} taken` : left < 0 ? `${Math.abs(left) === 1 ? 'day' : 'days'} over` : `${left === 1 ? 'day' : 'days'} left`}
        </span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span className="day-ink block h-full rounded-full transition-[width] duration-300" style={{ width: `${allowance === null ? 0 : Math.max(fill * 100, used > 0 ? 4 : 0)}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-ink-faint">
        {allowance === null ? `Not tracked · counted in ${windowLabel}` : `${used} of ${allowance} used in ${windowLabel}`}
      </p>
      <div className="mt-auto pt-4">
        <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-medium text-ink-secondary">Days allowed</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={366}
          placeholder="Not tracked"
          value={allowance ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const n = Math.max(0, Math.min(366, Math.round(Number(raw))));
            if (Number.isFinite(n)) onChange(n);
          }}
          className={fieldCls}
        />
      </div>
    </div>
  );
}

export function ScheduleSettings({ value, onChange, workingDays, onApplyDays, timezone, todayKey }: Props) {
  const entries = React.useMemo(() => parseDayEntries(workingDays), [workingDays]);
  const availability = { from: value.availableFrom, until: value.availableUntil };
  const hasDates = !!(value.availableFrom || value.availableUntil);
  const datesInvalid = !!(value.availableFrom && value.availableUntil && value.availableFrom > value.availableUntil);
  const leaveSpan = leaveWindow(value.leaveAllowancePer, todayKey, availability);
  const used = countLeave(entries, leaveSpan);

  // Availability, in days and in working days.
  const span = value.availableFrom && value.availableUntil && !datesInvalid ? dateRange(value.availableFrom, value.availableUntil) : null;
  const spanWorking = span?.filter((k) => dayKind(k, entries, availability) === 'working').length ?? 0;

  // ---- the month of days ----
  const [month, setMonth] = React.useState(() => monthOf(todayKey));
  const [range, setRange] = React.useState<{ from: string; to: string } | null>(null);
  const [type, setType] = React.useState<DayType>('working');
  const [reason, setReason] = React.useState('');
  const [skipWeekends, setSkipWeekends] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const weeks = React.useMemo(() => monthGrid(month), [month]);

  const pick = (key: string, extend: boolean) => {
    setStatus(null);
    if (extend && range) {
      setRange({ from: range.from <= key ? range.from : key, to: range.from <= key ? key : range.from });
      return;
    }
    setRange({ from: key, to: key });
    setType(dayTypeOf(key, entries));
    const entry = entries.get(key);
    setReason(entry?.typed ? entry.comment : '');
  };

  const rangeDays = range ? dateRange(range.from, range.to) : [];
  const spansWeekend = rangeDays.length > 1 && rangeDays.some(isWeekend) && rangeDays.some((k) => !isWeekend(k));
  const targetDays = spansWeekend && skipWeekends && type !== 'off' && type !== 'working' ? rangeDays.filter((k) => !isWeekend(k)) : rangeDays;

  const apply = async (mode: 'set' | 'reset') => {
    if (!range || targetDays.length === 0) return;
    setSaving(true);
    setStatus(null);
    const next = mode === 'set' ? setDayTypes(workingDays, targetDays, type, reason) : clearDayTypes(workingDays, rangeDays);
    const ok = await onApplyDays(next);
    setSaving(false);
    const n = mode === 'set' ? targetDays.length : rangeDays.length;
    setStatus(ok
      ? { tone: 'ok', text: mode === 'set' ? `Saved: ${n} ${n === 1 ? 'day' : 'days'} set to ${DAY_TYPES.find((t) => t.value === type)?.label.toLowerCase()}.` : `Back to the default week for ${n} ${n === 1 ? 'day' : 'days'}.` }
      : { tone: 'error', text: 'Couldn’t save that. Check your connection and try again.' });
  };

  const monthCounts = React.useMemo(() => {
    const counts: Partial<Record<DayKind, number>> = {};
    for (const week of weeks) for (const d of week) if (d.inMonth) {
      const k = dayKind(d.key, entries, availability);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
    // availability is rebuilt each render from these two values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, entries, value.availableFrom, value.availableUntil]);

  const rangeLabel = range
    ? range.from === range.to
      ? labelDate(range.from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${labelDate(range.from, { day: 'numeric', month: 'short' })} – ${labelDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  return (
    <div className="space-y-9">
      <Part id="sched-day" step="i." title="Your working day" hint="When your day starts and ends, and the stretch you keep for deep work. Today's timeline and the planner are drawn from these.">
        <div className="space-y-5">
          <DayRule value={value} timezone={timezone} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Workday starts" htmlFor="sched-work-start">
              <input id="sched-work-start" type="time" value={value.workStart} onChange={(e) => onChange({ workStart: e.target.value })} className={fieldCls} />
            </Field>
            <Field label="Workday ends" htmlFor="sched-work-end">
              <input id="sched-work-end" type="time" value={value.workEnd} onChange={(e) => onChange({ workEnd: e.target.value })} className={fieldCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Deep work from" htmlFor="sched-deep-start">
              <input id="sched-deep-start" type="time" value={value.deepWorkStart} onChange={(e) => onChange({ deepWorkStart: e.target.value })} className={fieldCls} />
            </Field>
            <Field label="Deep work until" htmlFor="sched-deep-end">
              <input id="sched-deep-end" type="time" value={value.deepWorkEnd} onChange={(e) => onChange({ deepWorkEnd: e.target.value })} className={fieldCls} />
            </Field>
            <div className="col-span-2 sm:col-span-1">
              <Field label="Longest session (minutes)" htmlFor="sched-deep-max">
                <input id="sched-deep-max" type="number" min={1} max={600} value={value.deepWorkMaxSession} onChange={(e) => onChange({ deepWorkMaxSession: Number(e.target.value) })} className={fieldCls} />
              </Field>
            </div>
          </div>
        </div>
      </Part>

      <Part id="sched-available" step="ii." title="When you're available" hint="The first and last day you're around - a contract, a placement, a term. Days outside them show as away on your calendars. Leave a date empty to keep that end open.">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Available from" htmlFor="sched-available-from">
              <div className="flex gap-2">
                <input id="sched-available-from" type="date" value={value.availableFrom ?? ''} max={value.availableUntil ?? undefined} onChange={(e) => onChange({ availableFrom: e.target.value || null })} className={fieldCls} />
                {value.availableFrom && (
                  <button type="button" onClick={() => onChange({ availableFrom: null })} className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground" aria-label="Clear the first available day">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Field>
            <Field label="Available until" htmlFor="sched-available-until">
              <div className="flex gap-2">
                <input id="sched-available-until" type="date" value={value.availableUntil ?? ''} min={value.availableFrom ?? undefined} onChange={(e) => onChange({ availableUntil: e.target.value || null })} aria-invalid={datesInvalid || undefined} aria-describedby={datesInvalid ? 'sched-available-error' : undefined} className={fieldCls} />
                {value.availableUntil && (
                  <button type="button" onClick={() => onChange({ availableUntil: null })} className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground" aria-label="Clear the last available day">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Field>
          </div>
          {datesInvalid ? (
            <p id="sched-available-error" role="alert" className="text-[13px] text-danger">The last available day must be on or after the first.</p>
          ) : (
            <p className="text-[13px] text-ink-secondary">
              {span
                ? <>Available for <strong className="font-semibold text-foreground tabular-nums">{span.length}</strong> days, <strong className="font-semibold text-foreground tabular-nums">{spanWorking}</strong> of them working days.</>
                : value.availableFrom
                  ? <>Available from {labelDate(value.availableFrom, { day: 'numeric', month: 'long', year: 'numeric' })}, with no end date.</>
                  : value.availableUntil
                    ? <>Available until {labelDate(value.availableUntil, { day: 'numeric', month: 'long', year: 'numeric' })}.</>
                    : <>Open-ended: every day follows your week.</>}
            </p>
          )}
        </div>
      </Part>

      <Part id="sched-leave" step="iii." title="Leave allowance" hint="How many days of leave and sick leave you have. Days you mark below are counted against them.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Allowance id="sched-leave-days" kind="leave" title="Leave" allowance={value.leaveAllowance} used={used.leave} windowLabel={leaveSpan.label} onChange={(n) => onChange({ leaveAllowance: n })} />
            <Allowance id="sched-sick-days" kind="sick" title="Sick leave" allowance={value.sickLeaveAllowance} used={used.sick} windowLabel={leaveSpan.label} onChange={(n) => onChange({ sickLeaveAllowance: n })} />
          </div>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <legend className="sr-only">Count the allowance</legend>
            <span className="text-ink-secondary">Allowance is for</span>
            {([['YEAR', 'each calendar year'], ['PERIOD', 'my available dates']] as const).map(([v, l]) => (
              <label key={v} className={`inline-flex cursor-pointer items-center gap-2 ${v === 'PERIOD' && !hasDates ? 'cursor-not-allowed text-ink-faint' : 'text-foreground'}`}>
                <input
                  type="radio"
                  name="sched-leave-per"
                  value={v}
                  checked={value.leaveAllowancePer === v}
                  disabled={v === 'PERIOD' && !hasDates}
                  onChange={() => onChange({ leaveAllowancePer: v })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {l}
              </label>
            ))}
            {!hasDates && <span className="text-[12px] text-ink-faint">(set your available dates to count across them)</span>}
          </fieldset>
        </div>
      </Part>

      <Part
        id="sched-days"
        step="iv."
        title="Working days and time off"
        hint={<>Pick a day to change it; shift-click a second day, or set the dates in the panel, to change a whole stretch. Weekdays are working days and weekends weekly off unless you say otherwise.</>}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h4 className="min-w-[9.5rem] text-center font-serif text-[18px] font-medium text-foreground" aria-live="polite">
                {labelDate(`${month}-01`, { month: 'long', year: 'numeric' })}
              </h4>
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
              {month !== monthOf(todayKey) && (
                <button type="button" onClick={() => setMonth(monthOf(todayKey))} className="ml-1 text-[13px] text-ink-secondary transition-colors hover:text-foreground">This month</button>
              )}
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-secondary">
              {(Object.keys(DAY_KIND_LABEL) as DayKind[]).filter((k) => monthCounts[k]).map((k) => (
                <span key={k} data-day-kind={k} className="inline-flex items-center gap-1.5">
                  <span className="day-ink h-2 w-2 rounded-full" />
                  <span className="tabular-nums font-medium text-foreground">{monthCounts[k]}</span> {k === 'working' ? (monthCounts[k] === 1 ? 'working day' : 'working days') : DAY_KIND_LABEL[k].toLowerCase()}
                </span>
              ))}
            </p>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-border bg-border">
            <div className="grid grid-cols-7 gap-px" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-surface px-2 py-1.5 text-center text-[11.5px] text-ink-secondary sm:text-left">{d}</div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0].key} className="mt-px grid grid-cols-7 gap-px">
                {week.map((d) => {
                  if (!d.inMonth) return <div key={d.key} className="bg-background" />;
                  const kind = dayKind(d.key, entries, availability);
                  const entry = entries.get(d.key);
                  const note = entry?.typed ? entry.comment : '';
                  const inRange = !!range && d.key >= range.from && d.key <= range.to;
                  const isToday = d.key === todayKey;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      data-day-kind={kind}
                      data-level={kind === 'working' ? 0 : 2}
                      onClick={(e) => pick(d.key, e.shiftKey)}
                      aria-pressed={inRange}
                      aria-label={`${labelDate(d.key, { weekday: 'long', day: 'numeric', month: 'long' })}: ${DAY_KIND_LABEL[kind]}${note ? `, ${note}` : ''}${isToday ? ', today' : ''}`}
                      title={note || undefined}
                      className={`day-tint day-tint-hover relative flex h-14 flex-col items-start justify-between p-1.5 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-16 ${inRange ? 'z-[1] shadow-[inset_0_0_0_2px_var(--text)]' : ''}`}
                    >
                      <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 font-serif text-[14px] font-medium leading-none tabular-nums ${isToday ? 'bg-foreground text-background' : 'text-foreground'}`}>
                        {d.day}
                      </span>
                      {kind !== 'working' && !(kind === 'weeklyOff' && isWeekend(d.key) && !note) && (
                        <span className="day-text max-w-full truncate text-[10px] font-semibold leading-none sm:text-[11px]">
                          {DAY_KIND_SHORT[kind]}
                          {note && <span className="hidden font-normal sm:inline"> · {note}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-secondary" aria-hidden="true">
            {(Object.keys(DAY_KIND_LABEL) as DayKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span data-day-kind={k} data-level={k === 'working' ? 0 : 2} className="day-tint h-3.5 w-3.5 rounded-[4px] shadow-[inset_0_0_0_1px_var(--border-c)]" />
                {DAY_KIND_LABEL[k]}
              </span>
            ))}
          </div>

          {range && (
            <div role="group" aria-labelledby="sched-range-title" className="rounded-[14px] border border-border-strong bg-surface p-4 shadow-[var(--shadow-lg)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="sched-range-title" className="font-serif text-[18px] font-medium text-foreground">{rangeLabel}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-secondary">
                    {rangeDays.length === 1 ? 'One day' : `${rangeDays.length} days${targetDays.length !== rangeDays.length ? `, ${targetDays.length} without the weekends` : ''}`}
                  </p>
                </div>
                <button type="button" onClick={() => { setRange(null); setStatus(null); }} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="sched-range-from">
                  <input id="sched-range-from" type="date" value={range.from} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: e.target.value > range.to ? e.target.value : range.to })} className={fieldCls} />
                </Field>
                <Field label="To" htmlFor="sched-range-to">
                  <input id="sched-range-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ from: range.from, to: e.target.value < range.from ? range.from : e.target.value })} className={fieldCls} />
                </Field>
              </div>

              <fieldset className="mt-4">
                <legend className="mb-2 text-[12.5px] font-medium text-ink-secondary">Mark as</legend>
                <div className="flex flex-wrap gap-2">
                  {DAY_TYPES.map((t) => (
                    <label
                      key={t.value}
                      data-day-kind={t.kind}
                      className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                        type === t.value ? 'border-foreground bg-surface-raised font-semibold text-foreground' : 'border-border-strong text-ink-secondary hover:border-ink-faint hover:text-foreground'
                      }`}
                    >
                      <input type="radio" name="sched-day-type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                      <span className="day-ink h-2.5 w-2.5 rounded-full" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Reason (optional)" htmlFor="sched-range-reason">
                  <input id="sched-range-reason" type="text" maxLength={120} value={reason} placeholder={type === 'sick' ? 'e.g. flu' : type === 'leave' ? 'e.g. family visit' : 'e.g. conference, public holiday'} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
                </Field>
                {spansWeekend && type !== 'off' && type !== 'working' && (
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 text-[13px] text-foreground">
                    <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                    Leave weekends as they are
                  </label>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p aria-live="polite" className={`text-[13px] ${status?.tone === 'error' ? 'text-danger' : 'text-primary'}`}>{status?.text ?? ''}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => apply('reset')} disabled={saving} className="h-9 rounded-[9px] px-3 text-[13.5px] text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground disabled:opacity-50">
                    Reset to default
                  </button>
                  <button type="button" onClick={() => apply('set')} disabled={saving || targetDays.length === 0} className="h-9 rounded-[9px] bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px disabled:opacity-50">
                    {saving ? 'Saving…' : targetDays.length === 1 ? 'Apply' : `Apply to ${targetDays.length} days`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Part>
    </div>
  );
}
