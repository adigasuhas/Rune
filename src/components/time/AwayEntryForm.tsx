'use client';

import React, { useState } from 'react';
import { Coffee, CloudFog } from 'lucide-react';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { formatDuration, type ActivityKind } from '@/lib/activityTime';
import { checkDraft, clockIn, hhmm, ymdIn } from '@/lib/awayTimes';
import { awayActions } from '@/lib/useAwaySessions';

export const awayField =
  'h-10 w-full rounded-[8px] border border-border bg-surface px-3 text-[14px] text-foreground tabular-nums transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const KINDS = [
  ['BREAK', 'Break', Coffee],
  ['BRAIN_DRAIN', 'Brain drain', CloudFog],
] as const;

/** Break or brain drain, as a two-way switch that fills its row. */
export function KindSwitch({ value, onChange, label = 'Kind' }: { value: ActivityKind; onChange: (k: ActivityKind) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 rounded-[10px] bg-surface-sunken p-[3px]">
      {KINDS.map(([k, l, Icon]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[13.5px] transition-[background-color,color,box-shadow] duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${value === k ? 'bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:text-foreground'}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {l}
        </button>
      ))}
    </div>
  );
}

function Labelled({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[12px] font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

/** Now, and fifteen minutes before it, in `tz`: the starting point for a new entry. */
function defaults(tz: string) {
  const end = new Date();
  const start = new Date(end.getTime() - 15 * 60_000);
  return { day: ymdIn(start, tz), start: hhmm(start, tz), end: hhmm(end, tz) };
}

/**
 * Log a break or brain drain that already happened. It opens on the current
 * date and time (the last fifteen minutes), so the common case - "I just took
 * one" - is a single Save; any other time is a couple of edits away. The
 * duration is worked out as you type, and an end before the start reads as
 * the next day.
 */
export function AwayEntryForm({
  timezone,
  onSaved,
  onCancel,
  submitLabel = 'Save',
}: {
  timezone: string;
  onSaved?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const today = getCurrentDateInTimezone(timezone);
  const [kind, setKind] = useState<ActivityKind>('BREAK');
  const [draft, setDraft] = useState(() => defaults(timezone));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const check = checkDraft(draft.day, draft.start, draft.end, timezone);
  const duration = check.start && check.end ? check.end.getTime() - check.start.getTime() : null;
  const set = (patch: Partial<typeof draft>) => { setDraft((d) => ({ ...d, ...patch })); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.start || !check.end) return setError('Give it a start and an end time.');
    if (check.error) return setError(check.error);
    setSaving(true);
    const r = await awayActions.add(kind, check.start, check.end);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setDraft(defaults(timezone));
    onSaved?.();
  };

  const shown = error || check.error;

  return (
    <form onSubmit={submit} aria-label="Log a break or brain drain" noValidate>
      <KindSwitch value={kind} onChange={setKind} />

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Labelled label="Date" className="col-span-2 sm:col-span-1">
          <input type="date" value={draft.day} max={today} onChange={(e) => e.target.value && set({ day: e.target.value })} className={awayField} />
        </Labelled>
        <Labelled label="From">
          <input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} className={awayField} required />
        </Labelled>
        <Labelled label="To">
          <input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} className={awayField} required />
        </Labelled>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-border pt-4" aria-live="polite">
        <p className="text-[12.5px] text-ink-secondary">
          {check.start && check.end ? (
            <>
              {clockIn(check.start, timezone)} – {clockIn(check.end, timezone)}
              {check.crossesMidnight && <span className="text-foreground"> · ends the next day</span>}
            </>
          ) : (
            'Pick a start and an end'
          )}
        </p>
        <p className="font-serif text-[26px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums" data-testid="away-duration">
          {duration !== null && duration > 0 ? formatDuration(duration) : '–'}
        </p>
      </div>

      {shown && <p role="alert" className="mt-3 text-[13px] text-danger">{shown}</p>}

      <div className="mt-6 flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-[9px] px-3.5 text-[14px] font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-[9px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] duration-[var(--duration-micro)] hover:bg-primary-hover active:translate-y-px disabled:opacity-60"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
