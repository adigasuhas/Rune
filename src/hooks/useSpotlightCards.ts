'use client';

import { useEffect } from 'react';

/**
 * Cursor-tracked spotlight hover for `.proj-card`/`.mkt-card` (see
 * design-mockup/rune-redesign.html's own bottom-of-file listener, which
 * targets its `.card`/`.proj-card` - this app's globals.css names the
 * marketing-card variant `.mkt-card` to avoid clashing with existing
 * `.card` usage elsewhere) - a single delegated `pointermove` sets
 * `--mx`/`--my` on whichever such element the pointer is over, which the
 * card's `::before` radial-gradient reads.
 */
export function useSpotlightCards() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('.proj-card, .mkt-card');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
}
