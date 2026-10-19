'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui';
import { useNotifications } from '@/context/NotificationContext';
import { useMinute } from '@/lib/useMinute';
import { focusDayPhrase, formatDateKey, type ReviewEntry } from '@/lib/dailyReview';

/**
 * "Your first move" - the first focus named in the last review, shown back
 * as the working day it was meant for begins. The server decides whether
 * there is one (right day, not yet acknowledged); this holds it until the
 * window opens and records "seen" only when the button is pressed.
 *
 * Motion: a ledger tape (dates, times, the words) runs slowly along the
 * top like a market ticker - decorative and aria-hidden, paused on hover,
 * on focus, or with its button. The first focus itself never moves: it's
 * revealed once, left to right. Under prefers-reduced-motion the tape is
 * still and nothing animates.
 */

interface FirstFocusPayload {
  focus: ReviewEntry | null;
  today?: string;
  workStart?: string;
  window?: { startsAt: string; endsAt: string };
}

const TAPE_SPEED = 30; // px per second - slow enough to read in passing
const REFRESH_MS = 15 * 60_000;

function clip(s: string, n: number) {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one;
}

function timeIn(iso: string | null, tz: string) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

export function FirstFocusCard({ timezone }: { timezone: string }) {
  const { toast } = useNotifications();
  const now = useMinute();
  const [data, setData] = useState<FirstFocusPayload | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);

  const load = useCallback(() => {
    fetch('/api/reviews/first-focus')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FirstFocusPayload | null) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  // Fetch on arrival, when the tab comes back, and now and then while
  // there's nothing to show - Rune left open overnight still greets the
  // next working day.
  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  const hasFocus = !!data?.focus;
  useEffect(() => {
    if (hasFocus) return;
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [hasFocus, load]);

  const focus = data?.focus;
  const win = data?.window;
  const inWindow = !!win && now.getTime() >= Date.parse(win.startsAt) && now.getTime() < Date.parse(win.endsAt);
  const visible = !!focus?.firstFocus && !!data?.today && inWindow;

  const acknowledge = async () => {
    if (!data?.today) return;
    const snapshot = data;
    setLeaving(true);
    try {
      const res = await fetch('/api/reviews/first-focus/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusDate: data.today }),
      });
      if (!res.ok) throw new Error(String(res.status));
      window.setTimeout(() => setData({ focus: null }), 240);
    } catch {
      setLeaving(false);
      setData(snapshot);
      toast('Not saved', 'Couldn’t record that. Try again.', 'error');
    }
  };

  if (!visible || !focus?.firstFocus || !data?.today) return null;

  const text = focus.firstFocus;
  const size = text.length > 360 ? 'text-[17px] leading-[1.5]' : text.length > 140 ? 'text-[20px] leading-[1.35]' : 'text-[clamp(22px,2.4vw,30px)] leading-[1.18]';
  const reviewDay = new Date(`${focus.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
  const lastReview = focusDayPhrase(focus.date, data.today) === 'tomorrow' ? 'yesterday’s review' : `your review on ${reviewDay}`;

  const tape: [string, string][] = [
    ['Today', formatDateKey(data.today, 'short')],
    ['Set', `${formatDateKey(focus.date, 'short')}${focus.reviewedAt ? ` · ${timeIn(focus.reviewedAt, timezone)}` : ''}`],
    ['Work starts', data.workStart || '08:00'],
    ...(focus.wentWell ? [['Went well', `“${clip(focus.wentWell, 64)}”`] as [string, string]] : []),
    ['First move', `“${clip(text, 56)}”`],
  ];

  return (
    <section
      aria-labelledby="first-focus-title"
      className={`first-focus relative overflow-hidden rounded-[14px] border border-border bg-surface ${leaving ? 'is-leaving' : ''}`}
    >
      <Tape items={tape} paused={paused} onTogglePause={() => setPaused((p) => !p)} />

      <div className="relative grid gap-5 py-5 pl-6 pr-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:py-6 sm:pl-8 sm:pr-6">
        {/* The ledger's margin rule - the one pine stroke, drawn once. */}
        <span aria-hidden="true" className="ff-rule absolute bottom-5 left-3 top-5 w-[2px] rounded-full bg-primary sm:left-4" />
        <div className="min-w-0">
          <h2 id="first-focus-title" className="text-[13px] text-ink-secondary">
            <span className="font-semibold text-foreground">Your first move today</span>
            <span className="text-ink-faint"> · from {lastReview}</span>
          </h2>
          <p className={`ff-reveal mt-2.5 max-w-[62ch] whitespace-pre-wrap break-words font-serif font-medium tracking-[-0.015em] text-foreground ${size}`}>
            {text}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
          <Button onClick={acknowledge} disabled={leaving}>
            Let’s begin <ArrowRight className="h-4 w-4" />
          </Button>
          <Link
            href="/analytics?tab=reviews"
            className="text-[12.5px] text-ink-faint underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            All reflections
          </Link>
        </div>
      </div>
    </section>
  );
}

function Tape({ items, paused, onTogglePause }: { items: [string, string][]; paused: boolean; onTogglePause: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLUListElement>(null);
  const [repeat, setRepeat] = useState(1);
  const [duration, setDuration] = useState(40);
  const itemsKey = items.map((i) => i.join(':')).join('|');

  // Each copy must be at least as wide as the strip, or the loop shows a
  // gap; the run then moves one copy's width per cycle at TAPE_SPEED.
  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current?.clientWidth ?? 0;
      const copy = copyRef.current?.scrollWidth ?? 0;
      if (!track || !copy) return;
      const perItems = copy / repeat;
      const need = Math.max(1, Math.ceil(track / perItems));
      if (need !== repeat) { setRepeat(need); return; }
      setDuration(Math.max(20, copy / TAPE_SPEED));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [repeat, itemsKey]);

  const run = Array.from({ length: repeat }, () => items).flat();
  const copy = (key: string, ref?: React.Ref<HTMLUListElement>) => (
    <ul key={key} ref={ref} className="flex shrink-0 items-center">
      {run.map(([label, value], i) => (
        <li key={i} className="flex items-baseline gap-2 whitespace-nowrap px-4">
          <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink-faint">{label}</span>
          <span className="font-mono text-[12px] text-foreground tabular-nums">{value}</span>
          <span aria-hidden="true" className="pl-4 text-[8px] text-border-strong">◆</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ff-tape flex h-9 items-stretch border-b border-border bg-surface-sunken/60">
      <div className="flex shrink-0 items-center gap-2 border-r border-border px-3 sm:px-4">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-primary">First focus</span>
      </div>
      <div ref={trackRef} className="ff-tape-track relative min-w-0 flex-1 overflow-hidden" aria-hidden="true">
        <div
          className="ff-tape-run flex h-full w-max items-center"
          data-paused={paused ? 'true' : undefined}
          style={{ ['--ff-tape-duration' as string]: `${duration}s` }}
        >
          {copy('a', copyRef)}
          {copy('b')}
        </div>
      </div>
      <button
        type="button"
        onClick={onTogglePause}
        aria-pressed={paused}
        aria-label={paused ? 'Play the moving strip' : 'Pause the moving strip'}
        title={paused ? 'Play' : 'Pause'}
        className="grid w-9 shrink-0 place-items-center border-l border-border text-ink-faint transition-colors duration-[var(--duration-micro)] hover:bg-surface-sunken hover:text-foreground motion-reduce:hidden"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
