'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Coffee, CloudFog, PencilLine, Square } from 'lucide-react';
import { ACTIVITY_LABEL, type ActivityKind } from '@/lib/activityTime';
import { awayActions, useAwaySessions, type AwaySession } from '@/lib/useAwaySessions';
import { useNotifications } from '@/context/NotificationContext';
import { AwaySessionsDialog } from './AwaySessionsDialog';

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

/** The running break or brain drain, with its clock and a Stop button. */
export function RunningAway({ session, compact = false }: { session: AwaySession; compact?: boolean }) {
  const { toast } = useNotifications();
  const elapsed = useElapsed(session.start);
  const Icon = ICON[session.kind];
  const label = ACTIVITY_LABEL[session.kind];
  const stop = async () => {
    const r = await awayActions.stop(session.id);
    if (!r.ok) toast('Couldn’t stop it', r.error, 'error');
  };
  return (
    <div
      role="status"
      aria-label={`${label} running, ${elapsed}`}
      className={`inline-flex items-center gap-2 rounded-[9px] border border-border-strong bg-surface-sunken pl-2.5 pr-1 ${compact ? 'h-8' : 'h-9'}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-faint opacity-40 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ink-secondary" />
      </span>
      <Icon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <span className="font-mono text-[12.5px] text-ink-secondary tabular-nums">{elapsed}</span>
      <button
        type="button"
        onClick={stop}
        className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Square className="h-3 w-3 fill-current" aria-hidden="true" /> Stop
      </button>
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

  const item = 'flex w-full items-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none';

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {running ? (
        <RunningAway session={running} />
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
      {running && (
        <button type="button" onClick={() => setEditing(true)} className="grid h-9 w-9 place-items-center rounded-[9px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Fix break and brain drain times" title="Fix times">
          <PencilLine className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div role="menu" aria-label="Step away" className="absolute right-0 top-full z-40 mt-1.5 w-[17rem] rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_16px_36px_-18px_rgb(0_0_0/0.35)]">
          <button role="menuitem" type="button" className={item} onClick={() => start('BREAK')} autoFocus>
            <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" />
            <span>
              <span className="block text-[14px] font-medium text-foreground">Take a break</span>
              <span className="block text-[12.5px] text-ink-faint">Rest on purpose. Counts as active time.</span>
            </span>
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => start('BRAIN_DRAIN')}>
            <CloudFog className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" />
            <span>
              <span className="block text-[14px] font-medium text-foreground">Brain drain</span>
              <span className="block text-[12.5px] text-ink-faint">Here, but not focusing. No reason needed.</span>
            </span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); setEditing(true); }}>
            <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" />
            <span className="block text-[14px] text-foreground">Add or fix times…</span>
          </button>
        </div>
      )}

      {editing && <AwaySessionsDialog timezone={timezone} initialDate={date} onClose={() => setEditing(false)} />}
    </div>
  );
}
