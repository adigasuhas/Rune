'use client';

import React, { useMemo, useState } from 'react';
import { Coffee, CloudFog, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { ACTIVITY_LABEL, formatDuration, isLongRunning, type ActivityKind } from '@/lib/activityTime';
import { checkDraft, clockIn, hhmm, ymdIn } from '@/lib/awayTimes';
import { awayActions, type AwaySession } from '@/lib/useAwaySessions';
import { awayField } from './AwayEntryForm';
import { EndSessionDialog } from './EndSessionDialog';
import { useElapsed } from './AwayControl';

function dayHeading(ymd: string, today: string) {
  if (ymd === today) return 'Today';
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Recorded breaks and brain drain, newest day first: change the kind or the
 * times in place, delete one (after a confirmation), or set the real end of
 * one that's still running. Every change is saved straight away and the
 * hours in Analytics follow.
 */
export function AwayLog({
  sessions,
  timezone,
  today,
  emptyText = 'Nothing recorded yet.',
  limitDays,
}: {
  sessions: AwaySession[];
  timezone: string;
  today: string;
  emptyText?: string;
  limitDays?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [showDays, setShowDays] = useState(limitDays ?? Infinity);
  const groups = useMemo(() => {
    const byDay = new Map<string, AwaySession[]>();
    for (const s of [...sessions].sort((a, b) => (a.start < b.start ? 1 : -1))) {
      const d = ymdIn(s.start, timezone);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(s);
    }
    return [...byDay.entries()];
  }, [sessions, timezone]);

  if (groups.length === 0) return <p className="py-2 text-[13.5px] text-ink-faint">{emptyText}</p>;

  return (
    <div className="space-y-5" data-testid="away-log">
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      {groups.slice(0, showDays).map(([day, items]) => {
        const total = items.reduce((s, x) => s + (x.end ? new Date(x.end).getTime() - new Date(x.start).getTime() : 0), 0);
        return (
          <section key={day} aria-label={dayHeading(day, today)}>
            <div className="flex items-baseline justify-between border-b border-border pb-1.5">
              <h4 className="text-[13px] font-semibold text-foreground">{dayHeading(day, today)}</h4>
              <span className="text-[12px] text-ink-secondary tabular-nums">{formatDuration(total)}</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <LogRow key={`${s.id}:${s.start}:${s.end}:${s.kind}`} session={s} day={day} timezone={timezone} onError={setError} />
              ))}
            </ul>
          </section>
        );
      })}
      {groups.length > showDays && (
        <button type="button" onClick={() => setShowDays((n) => n + 14)} className="text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
          Show earlier days
        </button>
      )}
    </div>
  );
}

function LogRow({ session, day, timezone, onError }: { session: AwaySession; day: string; timezone: string; onError: (e: string | null) => void }) {
  const confirm = useConfirm();
  const [start, setStart] = useState(hhmm(session.start, timezone));
  const [end, setEnd] = useState(session.end ? hhmm(session.end, timezone) : '');
  const [ending, setEnding] = useState(false);
  const elapsed = useElapsed(session.end ? null : session.start);
  const label = ACTIVITY_LABEL[session.kind];
  const Icon = session.kind === 'BREAK' ? Coffee : CloudFog;
  const long = isLongRunning(session);

  const reset = () => {
    setStart(hhmm(session.start, timezone));
    setEnd(session.end ? hhmm(session.end, timezone) : '');
  };

  const save = async (patch: { kind?: ActivityKind; start?: string; end?: string }) => {
    let startAt: Date | undefined;
    let endAt: Date | undefined;
    if (session.end) {
      const c = checkDraft(day, patch.start ?? start, patch.end ?? end, timezone);
      if (!c.start || !c.end) return;
      if (c.error) { onError(c.error); reset(); return; }
      startAt = c.start;
      endAt = c.end;
    } else if (patch.start) {
      const c = checkDraft(day, patch.start, hhmm(new Date(), timezone), timezone);
      if (c.start) startAt = c.start;
    }
    const r = await awayActions.update(session.id, { kind: patch.kind, start: startAt, end: endAt });
    if (!r.ok) { onError(r.error); reset(); } else onError(null);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete this ${label.toLowerCase()}?`,
      message: `${clockIn(session.start, timezone)}${session.end ? ` – ${clockIn(session.end, timezone)}` : ' (still running)'}. It comes out of your active hours.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const r = await awayActions.remove(session.id);
    onError(r.ok ? null : r.error);
  };

  const crosses = !!session.end && ymdIn(session.end, timezone) !== day;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="flex w-[8.5rem] shrink-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-secondary" aria-hidden="true" />
        <select
          value={session.kind}
          onChange={(e) => save({ kind: e.target.value as ActivityKind })}
          aria-label={`${label} at ${clockIn(session.start, timezone)}: kind`}
          className="h-8 min-w-0 rounded-[7px] border border-transparent bg-transparent px-1 text-[13.5px] font-medium text-foreground hover:border-border focus:border-border-strong focus:outline-none"
        >
          <option value="BREAK">Break</option>
          <option value="BRAIN_DRAIN">Brain drain</option>
        </select>
      </span>
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        onBlur={() => start !== hhmm(session.start, timezone) && save({ start })}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        aria-label={`${label}: start`}
        className={`${awayField} h-8`}
      />
      <span className="text-ink-faint" aria-hidden="true">–</span>
      {session.end ? (
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => end !== hhmm(session.end!, timezone) && save({ end })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label={`${label}: end`}
          className={`${awayField} h-8`}
        />
      ) : (
        <button type="button" onClick={() => setEnding(true)} className={`h-8 rounded-[8px] border px-2.5 text-[13px] font-medium ${long ? 'border-warning text-warning' : 'border-border-strong text-foreground'} hover:bg-surface-sunken`}>
          Set end
        </button>
      )}
      <span className="ml-auto text-[12.5px] tabular-nums text-ink-secondary">
        {session.end ? (
          <>{formatDuration(new Date(session.end).getTime() - new Date(session.start).getTime())}{crosses && <span className="text-ink-faint"> · next day</span>}</>
        ) : (
          <span className={long ? 'font-medium text-warning' : ''}>running {elapsed}</span>
        )}
      </span>
      <button type="button" onClick={remove} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-danger-soft hover:text-danger" aria-label={`Delete this ${label.toLowerCase()} (${clockIn(session.start, timezone)})`}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {ending && <EndSessionDialog session={session} timezone={timezone} onClose={() => setEnding(false)} />}
    </li>
  );
}
