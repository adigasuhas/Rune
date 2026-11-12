'use client';

import React, { useState } from 'react';
import { Coffee, CloudFog } from 'lucide-react';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { formatDuration, type ActivityKind } from '@/lib/activityTime';
import { checkDraft } from '@/lib/awayTimes';
import { awayActions } from '@/lib/useAwaySessions';

export const awayField =
  'h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[14px] text-foreground tabular-nums focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

/** Break or brain drain, as a two-way switch. */
export function KindSwitch({ value, onChange, label = 'Kind' }: { value: ActivityKind; onChange: (k: ActivityKind) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[9px] border border-border bg-surface-sunken p-0.5">
      {([['BREAK', 'Break', Coffee], ['BRAIN_DRAIN', 'Brain drain', CloudFog]] as const).map(([k, l, Icon]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] transition-colors ${value === k ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:text-foreground'}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {l}
        </button>
      ))}
    </div>
  );
}

/**
 * Log a break or brain drain that already happened: which it was, the day,
 * and when it started and ended. The duration is worked out as you type;
 * an end before the start means it ran past midnight.
 */
export function AwayEntryForm({
  timezone,
  defaultDate,
  onSaved,
  submitLabel = 'Save',
}: {
  timezone: string;
  defaultDate?: string;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const today = getCurrentDateInTimezone(timezone);
  const [kind, setKind] = useState<ActivityKind>('BREAK');
  const [day, setDay] = useState(defaultDate || today);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const check = checkDraft(day, start, end, timezone);
  const duration = check.start && check.end ? check.end.getTime() - check.start.getTime() : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.start || !check.end) return setError('Give it a start and an end time.');
    if (check.error) return setError(check.error);
    setSaving(true);
    const r = await awayActions.add(kind, check.start, check.end);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setStart('');
    setEnd('');
    onSaved?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Log a break or brain drain">
      <KindSwitch value={kind} onChange={setKind} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-secondary">
          Day
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className={`${awayField} w-[9.5rem]`} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-secondary">
          Start
          <input type="time" value={start} onChange={(e) => { setStart(e.target.value); setError(null); }} className={awayField} required />
        </label>
        <span className="pb-2 text-ink-faint" aria-hidden="true">–</span>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-secondary">
          End
          <input type="time" value={end} onChange={(e) => { setEnd(e.target.value); setError(null); }} className={awayField} required />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-secondary tabular-nums" aria-live="polite" data-testid="away-duration">
          {duration !== null ? (
            <>
              <span className="font-semibold text-foreground">{formatDuration(duration)}</span>
              {check.crossesMidnight && <span> · ends the next day</span>}
            </>
          ) : (
            'Duration shows here'
          )}
        </p>
        <button type="submit" disabled={saving} className="h-9 rounded-[9px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
      {(error || check.error) && (start && end) && <p role="alert" className="text-[13px] text-danger">{error || check.error}</p>}
      {error && !(start && end) && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </form>
  );
}
