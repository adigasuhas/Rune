'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

// The theme lives on <html data-theme>, set before paint by the inline
// script in layout.tsx. Read it as an external store so server HTML and the
// first client render agree (no hydration mismatch), then follow changes.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
const getSnapshot = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
const getServerSnapshot = (): Theme | null => null;

/**
 * Light/dark switch for the public pages. Writes the same key and fires the
 * same event as the in-app toggle (ClientLayout), so the choice carries over
 * after signing in. A half-filled circle rather than a sun/moon pair: it
 * reads as "contrast" in either state.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('rune_theme_v2', next); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent('rune-theme-changed', { detail: next }));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-[9px] text-ink-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Dark theme' : 'Light theme'}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" className="origin-center transition-transform duration-300" style={{ transform: theme === 'light' ? 'rotate(180deg)' : 'none' }} />
      </svg>
    </button>
  );
}
