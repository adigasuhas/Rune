'use client';

import React from 'react';
import Link from 'next/link';
import { Modal } from '@/components/Modal';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { shiftDay } from '@/lib/awayTimes';
import { useAwaySessions } from '@/lib/useAwaySessions';
import { AwayEntryForm } from './AwayEntryForm';
import { AwayLog } from './AwayLog';

/**
 * Breaks and brain drain from Today: log one that already happened (with the
 * day, start and end), and review or correct the last two weeks of entries.
 * None of it appears on a calendar; it only shapes the hours in Analytics.
 */
export function AwaySessionsDialog({ timezone, initialDate, onClose }: { timezone: string; initialDate?: string; onClose: () => void }) {
  const today = getCurrentDateInTimezone(timezone);
  const { sessions } = useAwaySessions({ from: shiftDay(today, -13), to: today });

  return (
    <Modal onClose={onClose} size="md">
      <Modal.Header title="Breaks and brain drain" onClose={onClose} />
      <Modal.Body className="!space-y-6">
        <p className="-mt-3 text-[13.5px] leading-relaxed text-ink-secondary">
          Kept off your calendar. They count toward your active hours, never as work.
        </p>

        <section aria-labelledby="away-log-new" className="rounded-[12px] border border-border bg-surface-sunken/50 p-4">
          <h3 id="away-log-new" className="mb-3 text-[13px] font-semibold text-foreground">Log one that already happened</h3>
          <AwayEntryForm timezone={timezone} defaultDate={initialDate} submitLabel="Add" />
        </section>

        <section aria-labelledby="away-log-recent">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 id="away-log-recent" className="text-[13px] font-semibold text-foreground">The last 14 days</h3>
            <Link href="/analytics?tab=activity" onClick={onClose} className="text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
              Full history
            </Link>
          </div>
          <AwayLog sessions={sessions} timezone={timezone} today={today} emptyText="Nothing in the last two weeks." />
        </section>
      </Modal.Body>
    </Modal>
  );
}
