'use client';

import { useEffect } from 'react';
import { Logo } from '@/components/Logo';

// Catches an unhandled render-time exception anywhere under the root layout
// (a bad API response shape, a null-deref) so the visitor sees a branded
// recovery screen instead of Next's default error page. `reset()` re-renders
// the segment without a full page reload - the right first move for a
// transient failure (a flaky fetch), with "Back to Rune" as the fallback.
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <Logo size="sm" />
      <p className="mt-8 font-mono text-[12.5px] text-muted-foreground">Error</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This page couldn’t load. Try again, and if it keeps happening, go back and try a different page.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm rounded-md transition-colors cursor-pointer"
        >
          Try again
        </button>
        {/* A full page load on purpose: after a crash, client-side
            navigation would reuse the state that just failed. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2.5 border border-border hover:bg-surface-sunken text-foreground font-semibold text-sm rounded-md transition-colors"
        >
          Back to Rune
        </a>
      </div>
    </div>
  );
}
