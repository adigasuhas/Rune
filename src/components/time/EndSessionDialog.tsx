'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui';
import { ACTIVITY_LABEL, formatDuration } from '@/lib/activityTime';
import { clockIn, hhmm, ymdIn } from '@/lib/awayTimes';
import { parseDateTimeInTimezone } from '@/lib/dateUtils';
import { awayActions, type AwaySession } from '@/lib/useAwaySessions';
import { awayField } from './AwayEntryForm';

/**
 * Ending a break or brain drain that has run a long time - most often one
 * that was forgotten. It offers "now" but makes the real end time easy to
 * give instead, so a forgotten timer doesn't become hours of break.
 */
export function EndSessionDialog({ session, timezone, onClose }: { session: AwaySession; timezone: string; onClose: () => void }) {
  const now = new Date();
  const label = ACTIVITY_LABEL[session.kind];
  const [day, setDay] = useState(ymdIn(now, timezone));
  const [time, setTime] = useState(hhmm(now, timezone));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const end = day && time ? parseDateTimeInTimezone(day, time, timezone) : null;
  const ms = end ? end.getTime() - new Date(session.start).getTime() : 0;

  const save = async (at: Date | null) => {
    setSaving(true);
    const r = at ? await awayActions.update(session.id, { end: at }) : await awayActions.stop(session.id);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    onClose();
  };

  return (
    <Modal onClose={onClose} size="sm">
      <Modal.Header title={`When did this ${label.toLowerCase()} end?`} onClose={onClose} />
      <Modal.Body>
        <p className="-mt-3 text-[13.5px] leading-relaxed text-ink-secondary">
          It started at <span className="font-medium text-foreground">{clockIn(session.start, timezone)}</span>
          {ymdIn(session.start, timezone) !== ymdIn(now, timezone) && <> on {new Date(session.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone })}</>} and is still running.
          If you forgot to stop it, set the time it really ended.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-secondary">
            Ended on
            <input type="date" value={day} min={ymdIn(session.start, timezone)} max={ymdIn(now, timezone)} onChange={(e) => e.target.value && setDay(e.target.value)} className={`${awayField} w-[9.5rem]`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-secondary">
            at
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={awayField} aria-label="End time" />
          </label>
          <p className="pb-2 text-[13px] text-ink-secondary tabular-nums" aria-live="polite">
            {ms > 0 ? <><span className="font-semibold text-foreground">{formatDuration(ms)}</span> in all</> : 'The end has to be after the start.'}
          </p>
        </div>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={() => save(null)} disabled={saving}>Stop now</Button>
        <Button onClick={() => end && ms > 0 && save(end)} disabled={saving || !end || ms <= 0}>Save end time</Button>
      </Modal.Footer>
    </Modal>
  );
}
