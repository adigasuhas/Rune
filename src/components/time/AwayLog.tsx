'use client';

import React, { useMemo, useState } from 'react';
import { Coffee, CloudFog } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { ACTIVITY_LABEL, formatDuration, isLongRunning, type ActivityKind } from '@/lib/activityTime';
import { checkDraft, clockIn, hhmm, ymdIn } from '@/lib/awayTimes';
import { awayActions, type AwaySession } from '@/lib/useAwaySessions';
import { KindSwitch, awayField } from './AwayEntryForm';
import { EndSessionDialog } from './EndSessionDialog';
import { useElapsed } from './AwayControl';

function dayHeading(ymd: string, today: string) {
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (ymd === today) return 'Today';
  if (ymd === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Recorded breaks and brain drain, newest first, as a plain list grouped by
 * day. Each entry reads as one line; Edit opens it in place to change the
 * kind or times, or to delete it (after a confirmation). Changes save at
 * once, and Analytics follows.
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
  const [editing, setEditing] = useState<string | null>(null);
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

  if (groups.length === 0) return <p className="py-6 text-center text-[13.5px] text-ink-secondary">{emptyText}</p>;

  return (
    <div className="space-y-6" data-testid="away-log">
      {groups.slice(0, showDays).map(([day, items]) => {
        const total = items.reduce((s, x) => s + (x.end ? new Date(x.end).getTime() - new Date(x.start).getTime() : 0), 0);
        return (
          <section key={day} aria-label={dayHeading(day, today)}>
            <div className="mb-1 flex items-baseline justify-between">
              <h4 className="text-[12.5px] font-semibold text-foreground">{dayHeading(day, today)}</h4>
              <span className="text-[12px] text-ink-secondary tabular-nums">{formatDuration(total)}</span>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {items.map((s) =>
                editing === s.id ? (
                  <EditRow key={s.id} session={s} day={day} timezone={timezone} onDone={() => setEditing(null)} />
                ) : (
                  <ReadRow key={`${s.id}:${s.start}:${s.end}:${s.kind}`} session={s} timezone={timezone} day={day} onEdit={() => setEditing(s.id)} />
                )
              )}
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

function ReadRow({ session, timezone, day, onEdit }: { session: AwaySession; timezone: string; day: string; onEdit: () => void }) {
  const [ending, setEnding] = useState(false);
  const elapsed = useElapsed(session.end ? null : session.start);
  const label = ACTIVITY_LABEL[session.kind];
  const Icon = session.kind === 'BREAK' ? Coffee : CloudFog;
  const long = isLongRunning(session);
  const nextDay = !!session.end && ymdIn(session.end, timezone) !== day;
  const range = `${clockIn(session.start, timezone)} – ${session.end ? clockIn(session.end, timezone) : 'now'}`;
  return (
    <li className="group grid grid-cols-[1rem_5.5rem_minmax(0,1fr)_auto_2.75rem] sm:grid-cols-[1rem_6.25rem_minmax(0,1fr)_auto_3.25rem] items-center gap-x-3 py-2" data-testid="away-entry">
      <Icon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
      <span className="truncate text-[13.5px] font-medium text-foreground">{label}</span>
      <span className="truncate text-[13px] text-ink-secondary tabular-nums">
        {range}{nextDay && ' (next day)'}
      </span>
      <span className={`text-right text-[13px] tabular-nums ${long ? 'font-medium text-warning' : 'text-foreground'}`}>
        {session.end ? formatDuration(new Date(session.end).getTime() - new Date(session.start).getTime()) : elapsed}
      </span>
      {session.end ? (
        <button
          type="button"
          onClick={onEdit}
          className="justify-self-end rounded-[6px] px-2 py-1 text-[12.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={`Edit ${label.toLowerCase()} ${range}`}
        >
          Edit
        </button>
      ) : (
        <button type="button" onClick={() => setEnding(true)} className={`justify-self-end rounded-[6px] px-2 py-1 text-[12.5px] font-semibold hover:bg-surface-sunken ${long ? 'text-warning' : 'text-foreground'}`}>
          End
        </button>
      )}
      {ending && <EndSessionDialog session={session} timezone={timezone} onClose={() => setEnding(false)} />}
    </li>
  );
}

function EditRow({ session, day, timezone, onDone }: { session: AwaySession; day: string; timezone: string; onDone: () => void }) {
  const confirm = useConfirm();
  const [kind, setKind] = useState<ActivityKind>(session.kind);
  const [start, setStart] = useState(hhmm(session.start, timezone));
  const [end, setEnd] = useState(hhmm(session.end!, timezone));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const label = ACTIVITY_LABEL[session.kind];
  const check = checkDraft(day, start, end, timezone);
  const duration = check.start && check.end ? check.end.getTime() - check.start.getTime() : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.start || !check.end) return setError('Give it a start and an end time.');
    if (check.error) return setError(check.error);
    setSaving(true);
    const r = await awayActions.update(session.id, { kind, start: check.start, end: check.end });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete this ${label.toLowerCase()}?`,
      message: `${clockIn(session.start, timezone)} – ${clockIn(session.end!, timezone)}. It comes out of your active hours.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const r = await awayActions.remove(session.id);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <li className="-mx-3 rounded-[10px] bg-surface-sunken/70 px-3 py-3.5" data-testid="away-editor">
      <form onSubmit={save} aria-label={`Edit ${label.toLowerCase()}`}>
        <KindSwitch value={kind} onChange={setKind} />
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-secondary">From</span>
            <input type="time" value={start} onChange={(e) => { setStart(e.target.value); setError(null); }} className={awayField} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-secondary">To</span>
            <input type="time" value={end} onChange={(e) => { setEnd(e.target.value); setError(null); }} className={awayField} />
          </label>
          <span className="h-10 min-w-[3.5rem] text-right font-serif text-[20px] leading-10 text-foreground tabular-nums">{duration && duration > 0 ? formatDuration(duration) : '–'}</span>
        </div>
        {(error || check.error) && <p role="alert" className="mt-2 text-[13px] text-danger">{error || check.error}</p>}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <button type="button" onClick={remove} className="rounded-[6px] px-1.5 py-1 text-[13px] font-medium text-danger hover:bg-danger-soft">
            Delete
          </button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onDone} className="h-8 rounded-[8px] px-3 text-[13px] font-semibold text-ink-secondary hover:bg-surface hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="h-8 rounded-[8px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}
