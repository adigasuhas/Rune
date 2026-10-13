'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RuneMark } from '@/components/brand/RuneMark';
import { FEATURES, FEATURE_GROUPS, FeatureIcon, type FeatureKey } from './FeatureIcons';

/**
 * "Everything you juggle, in one place." - the landing page's feature index.
 *
 * The heading's idea is drawn, not just said: the Rune character with the
 * eight parts of Rune in the air above him, like balls mid-juggle. The list
 * beside it groups the same eight by what they help with (your day, your
 * work, your people). Pointing at a row lifts its ball, and pointing at a
 * ball lights its row, so the picture and the index read as one thing.
 */
const BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<FeatureKey, (typeof FEATURES)[number]>;

// Ball positions on an arc over his head: percentages of the stage box.
const ORDER: FeatureKey[] = ['today', 'tasks', 'analytics', 'projects', 'notebook', 'runs', 'wall', 'teams'];
const BALLS = ORDER.map((key, i) => {
  const a = Math.PI * (0.94 - (i / (ORDER.length - 1)) * 0.88); // ~169deg -> ~11deg
  return { key, x: 50 + Math.cos(a) * 42, y: 66 - Math.sin(a) * 52 };
});

export function JuggleSection() {
  const [active, setActive] = useState<FeatureKey | null>(null);

  return (
    <section className="border-t border-border">
      <div className="mkt-container grid grid-cols-1 gap-12 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="display reveal text-[38px] sm:text-[46px]">Everything you juggle, in one place.</h2>
          <p className="reveal mt-5 max-w-[42ch] text-[16.5px] leading-relaxed text-ink-secondary">
            The useful parts of half a dozen apps (a to-do list, a planner, a LaTeX editor, a run log)
            built to know about each other.
          </p>

          <div className="juggle reveal relative mx-auto mt-10 aspect-[10/9] w-full max-w-[400px] select-none lg:mx-0" aria-hidden="true">
            <div className="absolute inset-x-0 bottom-0 grid place-items-center">
              <RuneMark size={176} animated className="text-foreground" />
            </div>
            {BALLS.map((b, i) => {
              const on = active === b.key;
              return (
                <span
                  key={b.key}
                  className="juggle-ball absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${-i * 0.45}s` }}
                  onMouseEnter={() => setActive(b.key)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-full border bg-surface transition-[transform,border-color,color,box-shadow] duration-300 ease-out sm:h-[52px] sm:w-[52px] ${
                      on
                        ? '-translate-y-2 scale-110 border-primary text-primary shadow-[0_10px_24px_-12px_color-mix(in_srgb,var(--primary)_70%,transparent)]'
                        : 'border-border text-foreground'
                    }`}
                  >
                    <FeatureIcon name={b.key} size={22} />
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-10">
          {FEATURE_GROUPS.map((g) => (
            <div key={g.id} className="reveal">
              <div className="flex items-baseline justify-between gap-4 border-b border-foreground/80 pb-3">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{g.label}</h3>
                <p className="text-[13.5px] text-ink-faint">{g.blurb}</p>
              </div>
              <ul>
                {g.keys.map((k) => {
                  const f = BY_KEY[k];
                  const on = active === k;
                  return (
                    <li key={k}>
                      <Link
                        href={`/features#${k}`}
                        onMouseEnter={() => setActive(k)}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive(k)}
                        onBlur={() => setActive(null)}
                        className={`group grid grid-cols-[40px_1fr_auto] items-center gap-x-4 border-b border-border py-4 pl-1 pr-2 transition-colors duration-200 sm:pl-2 ${on ? 'bg-surface' : ''}`}
                      >
                        <span className={`grid h-10 w-10 place-items-center rounded-[10px] border transition-colors duration-200 ${on ? 'border-primary/50 bg-primary-soft text-primary' : 'border-border bg-surface text-foreground'}`}>
                          <FeatureIcon name={k} size={21} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[16px] font-semibold tracking-[-0.01em]">{f.title}</span>
                          <span className="mt-0.5 block text-[14.5px] leading-snug text-ink-secondary">{f.line}</span>
                        </span>
                        <svg className={`transition-[transform,color] duration-200 ${on ? 'translate-x-1 text-foreground' : 'text-ink-faint'}`} viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <Link href="/features" className="link-arrow text-[15px]">
            Take the full tour
            <svg className="btn-arrow" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
