'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui';
import { parseDateTimeInTimezone, getCurrentDateInTimezone } from '@/lib/dateUtils';
import { ACTIVITY_LABEL, accountDay, formatDuration, type ActivityKind } from '@/lib/activityTime';
import { awayActions, useAwaySessions, type AwaySession } from '@/lib/useAwaySessions';

function hhmm(iso: string | Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function shiftDay(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Start/end on `day`; an end at or before the start means it ran past midnight. */
function toSpan(day: string, start: string, end: string, tz: string): { start: Date; end: Date } | null {
  if (!start || !end) return null;
  const s = parseDateTimeInTimezone(day, start, tz);
  let e = parseDateTimeInTimezone(day, end, tz);
  if (e <= s) e = new Date(e.getTime() + 86_400_000);
  return { start: s, end: e };
}

const field = 'h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[14px] text-foreground tabular-nums focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

/**
 * Breaks and brain drain for one day: correct a start or end, change which
 * it was, delete one, or add one you forgot to start. Nothing here appears
 * on any calendar; it only shapes the hours in Analytics.
 */
export function AwaySessionsDialog({ timezone, initialDate, onClose }: { timezone: string; initialDate?: string; onClose: () => void }) {
  const today = getCurrentDateInTimezone(timezone);
  const [day, setDayState] = useState(initialDate || today);
  const { sessions } = useAwaySessions({ from: day, to: day });
  const daySessions = useMemo(
    () => sessions.filter((s) => s.end && new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(s.start)) === day),
    [sessions, day, timezone]
  );
  const totals = accountDay([], daySessions);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: ActivityKind; start: string; end: string }>({ kind: 'BREAK', start: '', end: '' });

  const setDay = (d: string) => { setDayState(d); setError(null); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const span = toSpan(day, draft.start, draft.end, timezone);
    if (!span) return setError('Give it a start and an end.');
    const r = await awayActions.add(draft.kind, span.start, span.end);
    if (!r.ok) return setError(r.error);
    setError(null);
    setDraft({ kind: draft.kind, start: '', end: '' });
  };

  return (
    <Modal onClose={onClose} size="sm">
      <Modal.Header title="Breaks and brain drain" onClose={onClose} />
      <Modal.Body>
        <p className="-mt-3 text-[13.5px] leading-relaxed text-ink-secondary">
          Kept off your calendar. They’re part of your active hours in Analytics, and never counted as work.
        </p>

        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center">
            <button type="button" onClick={() => setDay(shiftDay(day, -1))} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" className={`${field} w-[9.5rem]`} />
            <button type="button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= today} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground disabled:opacity-30" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[12.5px] text-ink-secondary tabular-nums">
            {formatDuration(totals.breakMs)} break · {formatDuration(totals.drainMs)} brain drain
          </p>
        </div>

        {daySessions.length === 0 ? (
          <p className="py-2 text-[13.5px] text-ink-faint">Nothing recorded for this day.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Recorded">
            {daySessions.map((s) => (
              <SessionRow key={`${s.id}:${s.start}:${s.end}:${timezone}`} session={s} day={day} timezone={timezone} onError={setError} />
            ))}
          </ul>
        )}

        <form onSubmit={add} className="rounded-[10px] border border-dashed border-border-strong p-3">
          <p className="mb-2 text-[12.5px] font-medium text-ink-secondary">Add one you didn’t start</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ActivityKind })} aria-label="Kind" className={field}>
              <option value="BREAK">Break</option>
              <option value="BRAIN_DRAIN">Brain drain</option>
            </select>
            <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-label="Start" className={field} required />
            <span className="text-ink-faint" aria-hidden="true">–</span>
            <input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-label="End" className={field} required />
            <Button type="submit" variant="ghost" size="sm" className="ml-auto"><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        </form>

        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </Modal.Footer>
    </Modal>
  );
}

function SessionRow({ session, day, timezone, onError }: { session: AwaySession; day: string; timezone: string; onError: (e: string | null) => void }) {
  const [start, setStart] = useState(hhmm(session.start, timezone));
  const [end, setEnd] = useState(session.end ? hhmm(session.end, timezone) : '');

  const save = async (patch: { kind?: ActivityKind; start?: string; end?: string }) => {
    const span = toSpan(day, patch.start ?? start, patch.end ?? end, timezone);
    if (!span) return;
    const r = await awayActions.update(session.id, { kind: patch.kind, start: span.start, end: span.end });
    if (!r.ok) {
      onError(r.error);
      setStart(hhmm(session.start, timezone));
      setEnd(session.end ? hhmm(session.end, timezone) : '');
    } else onError(null);
  };

  const label = ACTIVITY_LABEL[session.kind];
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <select value={session.kind} onChange={(e) => save({ kind: e.target.value as ActivityKind })} aria-label={`${label}: kind`} className={field}>
        <option value="BREAK">Break</option>
        <option value="BRAIN_DRAIN">Brain drain</option>
      </select>
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => start !== hhmm(session.start, timezone) && save({ start })} aria-label={`${label}: start`} className={field} />
      <span className="text-ink-faint" aria-hidden="true">–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} onBlur={() => session.end && end !== hhmm(session.end, timezone) && save({ end })} aria-label={`${label}: end`} className={field} />
      <span className="ml-auto text-[12.5px] text-ink-faint tabular-nums">{session.end ? formatDuration(new Date(session.end).getTime() - new Date(session.start).getTime()) : ''}</span>
      <button
        type="button"
        onClick={async () => { const r = await awayActions.remove(session.id); onError(r.ok ? null : r.error); }}
        className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-danger-soft hover:text-danger"
        aria-label={`Delete this ${label.toLowerCase()}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
