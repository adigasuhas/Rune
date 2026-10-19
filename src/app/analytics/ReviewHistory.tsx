'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, EmptyState, SectionHeader } from '@/components/ui';
import { LoadError } from '@/components/LoadError';
import { focusDayPhrase, formatDateKey, type ReviewEntry } from '@/lib/dailyReview';

/**
 * Analytics → Reflections: every Review the Day, newest first, read as
 * written. A ledger of dates on the left, the selected day's two answers
 * on the right (stacked on small screens). These are words, not metrics -
 * the only figures are plain counts.
 */

interface Page {
  reviews: ReviewEntry[];
  nextBefore: string | null;
  summary: { total: number; withFocus: number; since: string | null };
}

function timeIn(iso: string | null, tz: string, withDay = false) {
  if (!iso) return '';
  const opts: Intl.DateTimeFormatOptions = withDay
    ? { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { timeZone: tz, hour: 'numeric', minute: '2-digit' };
  try { return new Intl.DateTimeFormat(undefined, opts).format(new Date(iso)); } catch { return new Date(iso).toLocaleString(); }
}

function monthOf(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function excerpt(r: ReviewEntry) {
  const s = (r.wentWell || r.firstFocus || '').replace(/\s+/g, ' ').trim();
  return s || 'Nothing written';
}

export function ReviewHistory({ timezone }: { timezone: string }) {
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [summary, setSummary] = useState<Page['summary'] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const paneRef = useRef<HTMLElement>(null);

  const fetchPage = useCallback(async (before?: string) => {
    try {
      const res = await fetch(`/api/reviews?limit=60${before ? `&before=${before}` : ''}`);
      if (!res.ok) throw new Error(String(res.status));
      const page: Page = await res.json();
      setReviews((prev) => (before ? [...prev, ...page.reviews] : page.reviews));
      setSummary(page.summary);
      setNextBefore(page.nextBefore);
      if (!before) setSelected((s) => s ?? page.reviews[0]?.date ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const load = (before?: string) => {
    setLoading(true);
    setFailed(false);
    void fetchPage(before);
  };

  // Fetch on mount; state is only set once the response is back.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchPage(); }, [fetchPage]);

  const index = reviews.findIndex((r) => r.date === selected);
  const current = index >= 0 ? reviews[index] : null;

  const groups = useMemo(() => {
    const out: { month: string; items: ReviewEntry[] }[] = [];
    for (const r of reviews) {
      const m = monthOf(r.date);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(r);
    }
    return out;
  }, [reviews]);

  const select = (date: string, opts: { focusRow?: boolean; reveal?: boolean } = {}) => {
    setSelected(date);
    if (opts.focusRow) {
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus());
    }
    // Stacked layout: bring the reading pane into view.
    if (opts.reveal && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => paneRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };

  const step = (delta: number, focusRow = false) => {
    const next = reviews[index + delta];
    if (next) select(next.date, { focusRow });
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowDown' ? 1 : -1, true);
    } else if (e.key === 'Home' && reviews[0]) {
      e.preventDefault(); select(reviews[0].date, { focusRow: true });
    } else if (e.key === 'End' && reviews.length) {
      e.preventDefault(); select(reviews[reviews.length - 1].date, { focusRow: true });
    }
  };

  if (failed && reviews.length === 0) return <LoadError what="your reflections" onRetry={() => load()} />;

  if (!loading && reviews.length === 0) {
    return (
      <section>
        <SectionHeader title="Reflections" />
        <EmptyState
          spot="done"
          title="No reviews yet"
          message="At the end of a day, Review the day on Today asks what went well and what comes first next. Your answers collect here, in your own words."
          action={<Link href="/"><Button variant="ghost">Go to Today</Button></Link>}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Reflections"
        meta={summary && summary.total > 0
          ? `${summary.total} review${summary.total === 1 ? '' : 's'}${summary.since ? ` since ${formatDateKey(summary.since, 'short')}` : ''} · ${summary.withFocus} named a first move`
          : null}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:gap-8">
        {/* Reading pane */}
        <article
          ref={paneRef}
          aria-live="polite"
          className="order-1 scroll-mt-24 lg:order-2 lg:sticky lg:top-6 lg:self-start"
        >
          {current ? (
            <ReviewPane
              key={current.date}
              review={current}
              timezone={timezone}
              onOlder={index < reviews.length - 1 ? () => step(1) : undefined}
              onNewer={index > 0 ? () => step(-1) : undefined}
              position={`${index + 1} of ${summary?.total ?? reviews.length}`}
            />
          ) : (
            <div className="h-48 rounded-[14px] border border-border bg-surface skeleton-shimmer" aria-hidden="true" />
          )}
        </article>

        {/* The ledger of dates */}
        <nav aria-label="Reviews by date" className="order-2 lg:order-1">
          <ul ref={listRef} onKeyDown={onListKey} className="space-y-5">
            {groups.map((g) => (
              <li key={g.month}>
                <p className="pb-1.5 text-[12.5px] font-semibold text-ink-secondary">{g.month}</p>
                <ul className="border-t border-border">
                  {g.items.map((r) => {
                    const active = r.date === selected;
                    return (
                      <li key={r.date}>
                        <button
                          type="button"
                          data-date={r.date}
                          aria-current={active ? 'true' : undefined}
                          tabIndex={active || (!selected && r === reviews[0]) ? 0 : -1}
                          onClick={() => select(r.date, { reveal: true })}
                          className={`group relative flex w-full items-baseline gap-3 border-b border-border py-2.5 pl-3 pr-2 text-left transition-colors duration-[var(--duration-micro)] ${
                            active ? 'bg-surface' : 'hover:bg-surface-sunken/60'
                          }`}
                        >
                          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[2px] ${active ? 'bg-primary' : 'bg-transparent'}`} />
                          <span className={`w-[5.5rem] shrink-0 font-mono text-[12px] tabular-nums ${active ? 'text-foreground' : 'text-ink-secondary'}`}>
                            {formatDateKey(r.date, 'short')}
                          </span>
                          <span className={`min-w-0 flex-1 truncate text-[13px] ${r.wentWell || r.firstFocus ? 'text-ink-secondary' : 'italic text-ink-faint'} ${active ? 'text-foreground' : ''}`}>
                            {excerpt(r)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {nextBefore && (
            <div className="pt-4">
              <Button variant="ghost" size="sm" onClick={() => load(nextBefore)} disabled={loading}>
                {loading ? 'Loading…' : 'Load older reviews'}
              </Button>
            </div>
          )}
          {failed && reviews.length > 0 && (
            <p className="pt-3 text-[12.5px] text-danger">Couldn’t load older reviews. <button className="underline" onClick={() => load(nextBefore ?? undefined)}>Try again</button></p>
          )}
        </nav>
      </div>
    </section>
  );
}

function ReviewPane({
  review,
  timezone,
  onOlder,
  onNewer,
  position,
}: {
  review: ReviewEntry;
  timezone: string;
  onOlder?: () => void;
  onNewer?: () => void;
  position: string;
}) {
  const edited = review.reviewedAt && review.updatedAt
    && Date.parse(review.updatedAt) - Date.parse(review.reviewedAt) > 60_000;
  const forDay = review.firstFocusDate ? focusDayPhrase(review.date, review.firstFocusDate) : 'next';
  const heading = new Date(`${review.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="rounded-[14px] border border-border bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="font-serif text-[24px] font-medium leading-tight tracking-[-0.015em] text-foreground">
            {heading}
          </h3>
          {review.reviewedAt && (
            <p className="mt-1 font-mono text-[11.5px] text-ink-faint tabular-nums">
              Reviewed {timeIn(review.reviewedAt, timezone)}
              {edited && <> · edited {timeIn(review.updatedAt, timezone, true)}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 font-mono text-[11.5px] text-ink-faint tabular-nums">{position}</span>
          <button type="button" onClick={onNewer} disabled={!onNewer} aria-label="Newer review" title="Newer"
            className="grid h-8 w-8 place-items-center rounded-md border border-border text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={onOlder} disabled={!onOlder} aria-label="Older review" title="Older"
            className="grid h-8 w-8 place-items-center rounded-md border border-border text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="divide-y divide-border">
        <Answer label="What went well" text={review.wentWell} />
        <Answer
          label={`First thing ${forDay === 'next' ? 'next' : forDay}`}
          text={review.firstFocus}
          foot={review.firstFocus ? (
            <>
              {review.firstFocusDate && (
                <span>
                  For {formatDateKey(review.firstFocusDate, 'short')}
                  {review.acknowledgedAt ? ` · seen ${timeIn(review.acknowledgedAt, timezone, true)}` : ''}
                </span>
              )}
              {review.firstFocusTaskId && <span>Added as a task</span>}
            </>
          ) : null}
        />
      </div>
    </div>
  );
}

function Answer({ label, text, foot }: { label: string; text: string | null; foot?: React.ReactNode }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <p className="text-[12.5px] font-semibold text-ink-secondary">{label}</p>
      {text ? (
        <p className="mt-2 max-w-[68ch] whitespace-pre-wrap break-words font-serif text-[18px] leading-[1.55] text-foreground">{text}</p>
      ) : (
        <p className="mt-2 text-[14px] italic text-ink-faint">Nothing written.</p>
      )}
      {foot && <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-ink-faint">{foot}</p>}
    </div>
  );
}
