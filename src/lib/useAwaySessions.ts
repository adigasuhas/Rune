'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActivityKind } from './activityTime';

export interface AwaySession {
  id: string;
  kind: ActivityKind;
  start: string;
  end: string | null;
}

/** Fired after any change, so every view of the running session updates together. */
export const AWAY_CHANGED = 'rune-away-changed';

/**
 * Breaks and brain drain, read from the server (so a running one survives a
 * refresh or a restart). `range` narrows to sessions that started in it;
 * the running one is always included. `runningOnly` fetches just that.
 * Null range = everything.
 */
export function useAwaySessions(range: { from?: string; to?: string; runningOnly?: boolean } | null = null) {
  const [sessions, setSessions] = useState<AwaySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const from = range?.from;
  const to = range?.to;
  const runningOnly = !!range?.runningOnly;

  const refresh = useCallback(async () => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (runningOnly) q.set('running', '1');
    try {
      const res = await fetch(`/api/activity-sessions${q.size ? `?${q}` : ''}`);
      if (res.ok) setSessions(await res.json());
    } catch {
      /* offline: keep what we have */
    } finally {
      setLoaded(true);
    }
  }, [from, to, runningOnly]);

  useEffect(() => {
    let live = true;
    const run = () => { if (live) void refresh(); };
    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener(AWAY_CHANGED, run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.removeEventListener(AWAY_CHANGED, run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const running = sessions.find((s) => !s.end) ?? null;
  return { sessions, running, loaded, refresh };
}

async function send(url: string, init: RequestInit): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      window.dispatchEvent(new Event(AWAY_CHANGED));
      return { ok: true };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error || 'That didn’t save. Try again.' };
  } catch {
    return { ok: false, error: 'You seem to be offline. Try again.' };
  }
}

export const awayActions = {
  start: (kind: ActivityKind) => send('/api/activity-sessions', { method: 'POST', body: JSON.stringify({ action: 'start', kind }) }),
  stop: (id: string) => send(`/api/activity-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ stop: true }) }),
  add: (kind: ActivityKind, start: Date, end: Date) =>
    send('/api/activity-sessions', { method: 'POST', body: JSON.stringify({ kind, start: start.toISOString(), end: end.toISOString() }) }),
  update: (id: string, patch: { kind?: ActivityKind; start?: Date; end?: Date }) =>
    send(`/api/activity-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ kind: patch.kind, start: patch.start?.toISOString(), end: patch.end?.toISOString() }),
    }),
  remove: (id: string) => send(`/api/activity-sessions/${id}`, { method: 'DELETE' }),
};
