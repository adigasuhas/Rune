'use client';

import React, { useRef, useState } from 'react';
import { Sunset, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useNotifications } from '@/context/NotificationContext';

interface Props {
  date: string; // YYYY-MM-DD
  completedTaskNames: string[];
  deepWorkHours: number;
  plannedCount: number;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * End-of-day ritual. Two moves, both optional:
 *  - name one thing that went well  (peak-end rule: close the day on the
 *    accomplishment, not the unfinished list)
 *  - name the first thing for tomorrow, which becomes a real task dated
 *    tomorrow (implementation intention, Gollwitzer 1999 - a concrete
 *    "first, I will..." is far more likely to get done)
 */
export function ReviewDayModal({ date, completedTaskNames, deepWorkHours, plannedCount, onClose, onSaved }: Props) {
  const { toast } = useNotifications();
  const [wentWell, setWentWell] = useState('');
  const [tomorrowFirst, setTomorrowFirst] = useState('');
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  const tomorrow = (() => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.toISOString().slice(0, 10);
  })();

  const save = async () => {
    setSaving(true);
    try {
      const summary = wentWell.trim()
        || (completedTaskNames.length > 0
          ? `Completed ${completedTaskNames.length} task${completedTaskNames.length === 1 ? '' : 's'}.`
          : 'Reviewed the day.');

      const res = await fetch('/api/accomplishments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, keyAchievements: summary })
      });
      if (!res.ok) { toast('Not saved', 'Couldn’t save your review. Try again.', 'error'); return; }

      if (tomorrowFirst.trim()) {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: tomorrowFirst.trim(),
            date: tomorrow,
            priority: 'HIGH',
            sessionType: 'DEEP_WORK'
          })
        }).catch(() => {});
      }

      onSaved();
      toast(
        'Day reviewed',
        tomorrowFirst.trim() ? `“${tomorrowFirst.trim()}” is first up tomorrow.` : 'Logged. See you tomorrow.',
        'success'
      );
      onClose();
    } catch {
      toast('Not saved', 'Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} size="sm" initialFocusRef={firstRef}>
      <Modal.Header title="Review the day" onClose={onClose} icon={<Sunset className="w-5 h-5 text-[var(--color-data-slate)]" />} />
      <Modal.Body>
        <div className="rounded-md bg-surface-sunken/50 border border-border px-3 py-2.5">
          <p className="font-mono text-[13px] text-foreground">
            {completedTaskNames.length} of {plannedCount} done
            {deepWorkHours > 0 ? ` · ${deepWorkHours}h deep work` : ''}
          </p>
          {completedTaskNames.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {completedTaskNames.slice(0, 5).map((n, i) => (
                <li key={i} className="text-[12px] text-ink-secondary truncate">✓ {n}</li>
              ))}
              {completedTaskNames.length > 5 && (
                <li className="text-[11px] text-ink-faint">+{completedTaskNames.length - 5} more</li>
              )}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="reviewdaymodal-one-thing-that-went-well" className="block text-[12.5px] font-semibold text-ink-faint mb-1">One thing that went well</label>
          <textarea id="reviewdaymodal-one-thing-that-went-well"
            ref={firstRef}
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            rows={2}
            placeholder="A result, a decision, a stretch of real focus…"
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
        </div>

        <div>
          <label htmlFor="reviewdaymodal-first-thing-tomorrow" className="block text-[12.5px] font-semibold text-ink-faint mb-1">First thing tomorrow</label>
          <textarea id="reviewdaymodal-first-thing-tomorrow"
            value={tomorrowFirst}
            onChange={(e) => setTomorrowFirst(e.target.value)}
            rows={2}
            placeholder="e.g. Finish the methods section"
            aria-describedby="reviewdaymodal-tomorrow-help"
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
          <p id="reviewdaymodal-tomorrow-help" className="mt-1 text-[12.5px] text-ink-faint">Rune adds it as a high-priority deep work task for tomorrow.</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" onClick={onClose} disabled={saving} className="px-3.5 py-2 text-[13px] font-semibold text-ink-secondary hover:text-foreground disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-[13px] font-semibold rounded-md disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Done for today'} <ArrowRight className="w-4 h-4" />
        </button>
      </Modal.Footer>
    </Modal>
  );
}
