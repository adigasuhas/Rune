'use client';

import { useEffect, useState } from 'react';

/**
 * The price: a zero whose currency quietly changes every two seconds -
 * free in rupees, euros, pounds, yen, dollars, won, naira, lira, pesos.
 * The symbol slides in from below while the old one leaves upward; the
 * zero itself never moves. Screen readers get one plain sentence instead,
 * and with reduced motion the symbol simply stays put.
 */
// Single-glyph symbols only, so the zero barely shifts as they change.
const CURRENCIES = ['₹', '€', '£', '¥', '$', '₩', '₦', '₺', '₱'];

export function CurrencyZero({ className = '' }: { className?: string }) {
  const [i, setI] = useState(0);
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => { setI((n) => (n + 1) % CURRENCIES.length); setTicked(true); }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const prev = (i - 1 + CURRENCIES.length) % CURRENCIES.length;

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="sr-only">Free, in any currency</span>
      {/* The clip box masks the slide, so it has to be tall enough for the
          tallest symbol: its own 1.25 line height (the price is set at a
          tight 0.85, which cropped the tops of ₹, ₩ and ₦), pulled back by
          -0.2em margins so it takes the same room in the line as the zero. */}
      <span aria-hidden="true" className="relative -my-[0.2em] inline-grid overflow-hidden pr-[0.04em] leading-[1.25] text-ink-secondary [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:justify-self-end">
        {ticked && <span key={`o${i}`} className="cur-out">{CURRENCIES[prev]}</span>}
        <span key={`i${i}`} className={ticked ? 'cur-in' : undefined}>{CURRENCIES[i]}</span>
      </span>
      <span aria-hidden="true">0</span>
    </span>
  );
}
