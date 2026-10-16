'use client';

import Link from 'next/link';
import { timezoneLabel } from '@/lib/timezoneLabel';
import { todayLine } from '@/lib/todayLines';
import { useMinute } from '@/lib/useMinute';

/**
 * The top of Today: when (date, time, and *your* time zone - set in
 * Settings, detected from the browser at sign-up), who, and one short line
 * that reads the room. The clock re-renders on the minute boundary, not on
 * a free-running interval, so it never lags the system clock by up to 59s.
 */

function partsIn(tz: string, d: Date) {
  try {
    const time = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).formatToParts(d);
    const clock = time.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    const period = time.find((p) => p.type === 'dayPeriod')?.value ?? '';
    const date = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const [y, m, day] = ymd.split('-').map(Number);
    const dayOfYear = Math.round((Date.UTC(y, m - 1, day) - Date.UTC(y, 0, 0)) / 86_400_000);
    return { clock, period, date, hour, dayOfYear };
  } catch {
    return { clock: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), period: '', date: d.toDateString(), hour: d.getHours(), dayOfYear: 1 };
  }
}

export function TodayHeader({
  name,
  timezone,
  open,
  done,
  overdue,
  offDay,
  worked,
  dayLabel,
  note,
  actions,
}: {
  name?: string | null;
  timezone: string;
  open: number;
  done: number;
  overdue: number;
  offDay: boolean;
  worked: string;
  /** Set when a day other than today is selected: the figures are that day's. */
  dayLabel?: string | null;
  note?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const now = useMinute();
  const p = partsIn(timezone, now);
  const tz = timezoneLabel(timezone, now);
  const greeting = p.hour < 5 ? 'Still up' : p.hour < 12 ? 'Good morning' : p.hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  const line = todayLine({ hour: p.hour, dayOfYear: p.dayOfYear, open, done, overdue, offDay });

  // One heading (the greeting), one line under it, then the when - date,
  // time and zone - as quiet supporting context rather than a widget.
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="app-title !text-[38px]">{greeting}{first ? `, ${first}` : ''}.</h1>
        <p className="mt-2 font-serif text-[18px] italic leading-snug text-ink-secondary">{line}</p>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5 text-[13.5px] text-ink-secondary">
          <span>{p.date}</span>
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <time className="font-medium text-foreground tabular-nums" dateTime={now.toISOString()}>
            {p.clock}{p.period && <span className="ml-0.5 lowercase">{p.period}</span>}
          </time>
          <Link
            href="/settings?section=general"
            title="Your time zone. Change it in Settings."
            className="ml-1 rounded-[5px] px-1 text-[12.5px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            {tz.abbr}{tz.offset && <span> · {tz.offset}</span>}
          </Link>
        </p>
        {note && <div className="mt-2">{note}</div>}
      </div>
      <div className="flex flex-col items-start gap-4 lg:items-end">
        <dl className="flex items-end gap-7 lg:text-right">
          <Figure value={`${done}/${done + open}`} label={dayLabel ? `done · ${dayLabel}` : 'done today'} />
          <Figure value={worked} label={dayLabel ? `worked · ${dayLabel}` : 'worked'} />
          {overdue > 0 && <Figure value={String(overdue)} label="overdue" tone="danger" />}
        </dl>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

function Figure({ value, label, tone }: { value: string; label: string; tone?: 'danger' }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12.5px] text-ink-faint">{label}</dt>
      <dd className={`font-serif text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-foreground'}`}>{value}</dd>
    </div>
  );
}
