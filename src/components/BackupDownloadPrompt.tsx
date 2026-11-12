'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, LogOut } from 'lucide-react';

export interface BackupPromptInfo {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  backup: { id: string; fileName: string; sizeBytes: number; createdAt: string };
}

const PERIOD = { DAILY: { noun: 'today’s', every: 'every day' }, WEEKLY: { noun: 'this week’s', every: 'every week' }, MONTHLY: { noun: 'this month’s', every: 'every month' } } as const;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * With automatic backups on, the first visit of each new day (or week, or
 * month) asks the owner to save the newest backup to their computer before
 * they change anything. Everything behind it is inert until they do; the
 * only other way out is signing out. Downloading the file here records it,
 * so the prompt doesn't come back until the next period.
 */
export function BackupDownloadPrompt({ info, timezone, onDone, onSignOut }: { info: BackupPromptInfo; timezone: string; onDone: () => void; onSignOut: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const period = PERIOD[info.frequency] ?? PERIOD.DAILY;

  // Make the rest of the app unreachable (mouse, keyboard and screen readers) while this is open.
  useEffect(() => {
    const el = ref.current;
    const siblings = el?.parentElement ? Array.from(el.parentElement.children).filter((c) => c !== el) as HTMLElement[] : [];
    siblings.forEach((s) => s.setAttribute('inert', ''));
    buttonRef.current?.focus();
    return () => siblings.forEach((s) => s.removeAttribute('inert'));
  }, []);

  const download = async () => {
    setState('saving');
    try {
      const res = await fetch(`/api/backups/${info.backup.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = info.backup.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onDone();
    } catch {
      setState('error');
    }
  };

  const made = new Date(info.backup.createdAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone });

  return (
    <div ref={ref} className="fixed inset-0 z-[200] grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="backup-prompt-title"
        aria-describedby="backup-prompt-body"
        className="w-full max-w-[420px] rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-lg)]"
        onKeyDown={(e) => {
          // Keep focus inside: Download and Sign out are the only stops.
          if (e.key !== 'Tab') return;
          const stops = Array.from(e.currentTarget.querySelectorAll('button')) as HTMLButtonElement[];
          const i = stops.indexOf(document.activeElement as HTMLButtonElement);
          e.preventDefault();
          stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
        }}
      >
        <h2 id="backup-prompt-title" className="font-serif text-[22px] font-medium leading-tight text-foreground">
          Download {period.noun} backup
        </h2>
        <p id="backup-prompt-body" className="mt-2 text-[14px] leading-relaxed text-ink-secondary">
          You’ve set Rune to back up your account {period.every}. Save a copy to this computer before you carry on, so a copy of your work always lives off Rune too.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-[10px] border border-border bg-surface-sunken/60 px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-primary-soft text-primary" aria-hidden="true">
            <Download className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[12.5px] text-foreground" title={info.backup.fileName}>{info.backup.fileName}</p>
            <p className="text-[12.5px] text-ink-secondary tabular-nums">{formatSize(info.backup.sizeBytes)} · made {made}</p>
          </div>
        </div>

        {state === 'error' && (
          <p role="alert" className="mt-3 text-[13px] text-danger">The download didn’t start. Check your connection and try again.</p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
          <button
            ref={buttonRef}
            type="button"
            onClick={download}
            disabled={state === 'saving'}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {state === 'saving' ? 'Downloading…' : state === 'error' ? 'Try again' : 'Download backup'}
          </button>
        </div>
      </div>
    </div>
  );
}
