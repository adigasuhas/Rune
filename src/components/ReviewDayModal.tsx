'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sunset, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useNotifications } from '@/context/NotificationContext';
import { focusDayPhrase, formatDateKey, nextWorkingDay, type ReviewEntry } from '@/lib/dailyReview';

interface Props {
  date: string; // YYYY-MM-DD
  /** Setting.workingDays - decides which day "first thing" is for. */
  workingDays: string;
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
 *  - name the first thing for the next working day (implementation
 *    intention, Gollwitzer 1999 - a concrete "first, I will..." is far more
 *    likely to get done). Today shows it back as that day starts.
 * Both answers are kept as written (Analytics → Reflections). Saving the
 * same day again updates that review. The first focus becomes a task only
 * if the box below it is ticked.
 */
export function ReviewDayModal({ date, workingDays, completedTaskNames, deepWorkHours, plannedCount, onClose, onSaved }: Props) {
  const { toast } = useNotifications();
  const [wentWell, setWentWell] = useState('');
  const [tomorrowFirst, setTomorrowFirst] = useState('');
  const [addAsTask, setAddAsTask] = useState(false);
  const [existing, setExisting] = useState<ReviewEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const touched = useRef(false);

  const focusDate = nextWorkingDay(date, workingDays);
  const phrase = focusDayPhrase(date, focusDate);

  // Reviewing a day twice edits that review - start from what was saved.
  useEffect(() => {
    let live = true;
    fetch(`/api/reviews?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const r: ReviewEntry | null = data?.review ?? null;
        if (!live || !r || touched.current) return;
        setExisting(r);
        setWentWell(r.wentWell ?? '');
        setTomorrowFirst(r.firstFocus ?? '');
      })
      .catch(() => {});
    return () => { live = false; };
  }, [date]);

  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    touched.current = true;
    set(e.target.value);
  };

  const alreadyTask = !!existing?.firstFocusTaskId && existing.firstFocus === tomorrowFirst.trim();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          wentWell,
          firstFocus: tomorrowFirst,
          addFirstFocusAsTask: addAsTask && !alreadyTask,
        })
      });
      if (!res.ok) { toast('Not saved', 'Couldn’t save your review. Try again.', 'error'); return; }
      const { review, taskCreated, updated } = await res.json() as { review: ReviewEntry; taskCreated: boolean; updated: boolean };

      onSaved();
      const when = review.firstFocusDate ? focusDayPhrase(date, review.firstFocusDate) : phrase;
      toast(
        updated ? 'Review updated' : 'Day reviewed',
        review.firstFocus
          ? `“${review.firstFocus.split('\n')[0]}” is first up ${when === 'tomorrow' ? 'tomorrow' : `on ${when}`}.${taskCreated ? ' Added as a task.' : ''}`
          : 'Logged. See you tomorrow.',
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
            onChange={edit(setWentWell)}
            rows={2}
            placeholder="A result, a decision, a stretch of real focus…"
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
        </div>

        <div>
          <label htmlFor="reviewdaymodal-first-thing-tomorrow" className="block text-[12.5px] font-semibold text-ink-faint mb-1">First thing {phrase}</label>
          <textarea id="reviewdaymodal-first-thing-tomorrow"
            value={tomorrowFirst}
            onChange={edit(setTomorrowFirst)}
            rows={2}
            placeholder="e.g. Finish the methods section"
            aria-describedby="reviewdaymodal-tomorrow-help"
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
          <p id="reviewdaymodal-tomorrow-help" className="mt-1 text-[12.5px] text-ink-faint">
            Today shows it back to you as {formatDateKey(focusDate)} starts.
          </p>
          {tomorrowFirst.trim() && (
            alreadyTask ? (
              <p className="mt-2 text-[12.5px] text-ink-secondary">Already on your task list for {formatDateKey(focusDate, 'short')}.</p>
            ) : (
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addAsTask}
                  onChange={(e) => setAddAsTask(e.target.checked)}
                  className="rounded-[3px] border-border-strong text-primary focus:ring-ring"
                />
                Also add it as a high-priority deep work task for {formatDateKey(focusDate, 'short')}
              </label>
            )
          )}
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
          {saving ? 'Saving…' : existing ? 'Update review' : 'Done for today'} <ArrowRight className="w-4 h-4" />
        </button>
      </Modal.Footer>
    </Modal>
  );
}
