'use client';

import React, { useState } from 'react';
import { ArrowLeft, History, X } from 'lucide-react';
import { Modal, useModalTitleId } from '@/components/Modal';
import { useNotifications } from '@/context/NotificationContext';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { formatDuration } from '@/lib/activityTime';
import { shiftDay } from '@/lib/awayTimes';
import { useAwaySessions } from '@/lib/useAwaySessions';
import { AwayEntryForm } from './AwayEntryForm';
import { AwayLog } from './AwayLog';

type View = 'log' | 'history';

function Title({ children }: { children: React.ReactNode }) {
  const id = useModalTitleId();
  return <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">{children}</h2>;
}

/**
 * "Log one" from Today's Step away menu. It opens on a short form set to the
 * current date and time; History (top right) lists what's already recorded,
 * a month at a time, where any entry can be corrected or deleted.
 * Nothing here appears on a calendar.
 */
export function AwaySessionsDialog({ timezone, onClose, initialView = 'log' }: { timezone: string; initialDate?: string; onClose: () => void; initialView?: View }) {
  const { toast } = useNotifications();
  const [view, setView] = useState<View>(initialView);
  const [days, setDays] = useState(30);
  const today = getCurrentDateInTimezone(timezone);
  const { sessions, loaded } = useAwaySessions(view === 'history' ? { from: shiftDay(today, -(days - 1)), to: today } : { runningOnly: true });
  const total = sessions.reduce((s, x) => s + (x.end ? new Date(x.end).getTime() - new Date(x.start).getTime() : 0), 0);

  const iconBtn = 'grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

  return (
    <Modal onClose={onClose} size="sm" className="!max-w-[460px] !p-0">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-5 py-3.5">
        {view === 'history' && (
          <button type="button" onClick={() => setView('log')} className={`${iconBtn} -ml-1.5`} aria-label="Back to Log one">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <Title>{view === 'log' ? 'Log one' : 'History'}</Title>
        <div className="ml-auto flex items-center gap-1">
          {view === 'log' && (
            <button
              type="button"
              onClick={() => setView('history')}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" /> History
            </button>
          )}
          <button type="button" onClick={onClose} className={iconBtn} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === 'log' ? (
        <div className="px-5 pb-5 pt-5">
          <AwayEntryForm
            timezone={timezone}
            onCancel={onClose}
            onSaved={() => {
              toast('Logged', 'It’s in your history and your active hours.', 'success');
              onClose();
            }}
          />
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4">
          <p className="mb-5 flex items-baseline justify-between text-[12.5px] text-ink-secondary">
            <span>Last {days} days</span>
            {loaded && sessions.length > 0 && <span className="tabular-nums">{formatDuration(total)} in all</span>}
          </p>
          {loaded ? (
            <AwayLog sessions={sessions} timezone={timezone} today={today} emptyText={`No breaks or brain drain in the last ${days} days.`} />
          ) : (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-[8px] bg-surface-sunken" />)}
            </div>
          )}
          <div className="mt-5 flex justify-center">
            <button type="button" onClick={() => setDays((d) => d + 30)} className="text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
              Show older
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
