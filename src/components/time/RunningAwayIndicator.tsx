'use client';

import React from 'react';
import { Coffee, CloudFog } from 'lucide-react';
import { useAwaySessions, awayActions } from '@/lib/useAwaySessions';
import { ACTIVITY_LABEL } from '@/lib/activityTime';
import { RunningAway, useElapsed } from './AwayControl';

/**
 * A running break or brain drain, wherever you are in Rune, so it can be
 * stopped without going back to Today. Nothing shows when none is running.
 * `iconOnly` is for the collapsed sidebar: the icon and clock, click to stop.
 */
export function RunningAwayIndicator({ iconOnly = false, className = '', timezone }: { iconOnly?: boolean; className?: string; timezone?: string }) {
  const { running } = useAwaySessions({ runningOnly: true });
  const elapsed = useElapsed(running?.start ?? null);
  if (!running) return null;
  if (iconOnly) {
    const Icon = running.kind === 'BREAK' ? Coffee : CloudFog;
    const label = ACTIVITY_LABEL[running.kind];
    return (
      <button
        type="button"
        onClick={() => void awayActions.stop(running.id)}
        title={`${label} · ${elapsed}. Click to stop.`}
        aria-label={`Stop ${label.toLowerCase()} (${elapsed})`}
        className={`grid h-9 w-9 place-items-center rounded-md bg-surface-sunken text-ink-secondary hover:text-foreground ${className}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div className={className}>
      <RunningAway session={running} compact timezone={timezone} />
    </div>
  );
}
