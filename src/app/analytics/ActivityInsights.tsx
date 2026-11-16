'use client';

import React, { useState } from 'react';
import type { ActivityLike, DayAccount } from '@/lib/activityTime';
import type { AwaySession } from '@/lib/useAwaySessions';
import { AwayEntryForm } from '@/components/time/AwayEntryForm';
import { AwayLog } from '@/components/time/AwayLog';
import { RunningAway } from '@/components/time/AwayControl';
import { ActiveHours, type ActiveRange } from './ActiveHours';

/**
 * Breaks and brain drain on their own: how much and when, the running one
 * (if any), a form for one that already happened, and the full history to
 * correct or delete. Every change here feeds working and active hours at once.
 */
export function ActivityInsights({
  accounts,
  sessions,
  timezone,
  today,
}: {
  accounts: Map<string, DayAccount>;
  sessions: ActivityLike[];
  timezone: string;
  today: string;
}) {
  const [range, setRange] = useState<ActiveRange>('week');
  const list = sessions as AwaySession[];
  const running = list.find(s => !s.end) ?? null;

  return (
    <div className="space-y-10">
      {running && (
        <div className="flex flex-wrap items-center gap-3 border-y border-border py-3">
          <span className="text-[13px] text-ink-secondary">Running now</span>
          <RunningAway session={running} timezone={timezone} />
        </div>
      )}

      <ActiveHours accounts={accounts} today={today} range={range} onRange={setRange} series="away" />

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 border-t border-border-strong pt-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="activity-history">
          <h2 id="activity-history" className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-foreground">History</h2>
          <AwayLog sessions={list} timezone={timezone} today={today} limitDays={14} emptyText="No breaks or brain drain recorded yet." />
        </section>
        <section aria-labelledby="activity-add" className="lg:sticky lg:top-4 lg:self-start">
          <h2 id="activity-add" className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-foreground">Log one</h2>
          <AwayEntryForm timezone={timezone} submitLabel="Save" />
        </section>
      </div>
    </div>
  );
}
