'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ClockArrowDown, Coffee, CloudFog, Square } from 'lucide-react';
import { ACTIVITY_LABEL, isLongRunning, type ActivityKind } from '@/lib/activityTime';
import { awayActions, useAwaySessions, type AwaySession } from '@/lib/useAwaySessions';
import { useNotifications } from '@/context/NotificationContext';
import { AwaySessionsDialog } from './AwaySessionsDialog';
import { EndSessionDialog } from './EndSessionDialog';

const ICON: Record<ActivityKind, typeof Coffee> = { BREAK: Coffee, BRAIN_DRAIN: CloudFog };

/** "4:07" / "1:02:09" since `start`, ticking each second. */
export function useElapsed(start: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);
  if (!start) return '';
  const s = Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * The running break or brain drain, with its clock and a Stop button. Past
 * two hours it turns into a question - still going? - and Stop asks when it
 * really ended, so a forgotten timer is easy to correct.
 */
export function RunningAway({ session, compact = false, timezone }: { session: AwaySession; compact?: boolean; timezone?: string }) {
  const { toast } = useNotifications();
  const elapsed = useElapsed(session.start);
  const [ending, setEnding] = useState(false);
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const Icon = ICON[session.kind];
  const label = ACTIVITY_LABEL[session.kind];
  // Re-evaluated each second along with the clock.
  const long = elapsed !== '' && isLongRunning(session);
  const stop = async () => {
    if (long) return setEnding(true);
    const r = await awayActions.stop(session.id);
    if (!r.ok) toast('Couldn’t stop it', r.error, 'error');
  };
  return (
    <div
      role="status"
      aria-label={`${label} running, ${elapsed}${long ? '. It has been going a long time' : ''}`}
      className={`inline-flex items-center gap-2 rounded-[9px] border pl-2.5 pr-1 ${compact ? 'h-8' : 'h-9'} ${long ? 'border-warning bg-warning-soft' : 'border-border-strong bg-surface-sunken'}`}
    >
      {long ? (
        <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
      ) : (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-faint opacity-40 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ink-secondary" />
        </span>
      )}
      <Icon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
      <span className="text-[13px] font-medium text-foreground">{long ? `Still on ${session.kind === 'BREAK' ? 'a break' : 'brain drain'}?` : label}</span>
      <span className="font-mono text-[12.5px] text-ink-secondary tabular-nums">{elapsed}</span>
      {long && (
        <button type="button" onClick={() => setEnding(true)} className="inline-flex h-7 items-center rounded-[7px] px-2 text-[12.5px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:bg-surface">
          Set end time
        </button>
      )}
      <button
        type="button"
        onClick={stop}
        className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Square className="h-3 w-3 fill-current" aria-hidden="true" /> Stop
      </button>
      {ending && <EndSessionDialog session={session} timezone={tz} onClose={() => setEnding(false)} />}
    </div>
  );
}

/**
 * Today's "step away" control. Idle: one quiet button with a short menu -
 * take a break, mark brain drain, or fix the times. Running: the live clock
 * and Stop. Neither ever lands on the calendar.
 */
export function AwayControl({ timezone, date }: { timezone: string; date?: string }) {
  const { running } = useAwaySessions({ from: date, to: date });
  const { toast } = useNotifications();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const start = async (kind: ActivityKind) => {
    setOpen(false);
    const r = await awayActions.start(kind);
    if (!r.ok) toast('Couldn’t start it', r.error, 'error');
  };

  const item = 'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] text-foreground transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none';

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {running ? (
        <RunningAway session={running} timezone={timezone} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-transparent px-2.5 text-[14px] font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Coffee className="h-4 w-4" aria-hidden="true" /> Step away <ChevronDown className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div role="menu" aria-label="Step away" className="absolute right-0 top-full z-40 mt-1.5 w-[12.5rem] rounded-[12px] border border-border bg-surface p-1 shadow-[0_16px_36px_-18px_rgb(0_0_0/0.35)]">
          <button role="menuitem" type="button" className={item} onClick={() => start('BREAK')} autoFocus>
            <Coffee className="h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" /> Take a break
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => start('BRAIN_DRAIN')}>
            <CloudFog className="h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" /> Brain drain
          </button>
          <div className="mx-2 my-1 h-px bg-border" aria-hidden="true" />
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); setEditing(true); }}>
            <ClockArrowDown className="h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" /> Log one
          </button>
        </div>
      )}

      {editing && <AwaySessionsDialog timezone={timezone} onClose={() => setEditing(false)} />}
    </div>
  );
}
