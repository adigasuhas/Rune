'use client';

import { AlertCircle, RotateCw } from 'lucide-react';

/**
 * Shown when a page's data didn't load (server error, offline). Without it
 * a failed fetch looks exactly like a brand-new empty account - "No projects
 * yet" - which reads as lost work. Pages show this instead of their empty
 * state, and say what's affected, not a status code.
 */
export function LoadError({ what, onRetry, className = '' }: { what: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-[12px] sm:grid-cols-[auto_minmax(0,1fr)_auto] border border-danger/30 bg-danger/[0.06] px-4 py-3.5 ${className}`}>
      <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-danger" aria-hidden="true" />
      <div>
        <p className="text-[14px] font-semibold text-foreground">Couldn’t load {what}.</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-secondary">
          Nothing has been lost. Check your connection, then try again. What’s on this page may be incomplete until then.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry ?? (() => location.reload())}
        className="col-start-2 inline-flex h-8 items-center justify-self-start sm:col-start-3 sm:row-start-1 gap-1.5 rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
