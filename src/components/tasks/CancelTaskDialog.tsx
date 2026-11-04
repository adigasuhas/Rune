'use client';

import React, { useMemo, useRef, useState } from 'react';
import { CircleSlash, Clock3 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useNotifications } from '@/context/NotificationContext';
import { CANCEL_REASONS, CANCEL_REASON_MAX, cleanCancelReason } from '@/lib/taskCancel';

interface Slot { taskId?: string | null; completed?: boolean }

interface CancelTaskDialogProps {
  task: { id: string; name: string; status: string; date: string; estimatedTime?: number; priority?: string; cancelReason?: string | null };
  /** The task's calendar slots, to say what happens to them. */
  events: Slot[];
  /** Shown under the name, e.g. the project. */
  projectName?: string | null;
  timezone: string;
  onClose: () => void;
  /** Called with the updated task after a successful save. */
  onSaved: (updated: any) => void;
}

/**
 * Cancels a task - or, for one already cancelled, edits why. Like
 * postponing, it asks for the reason, but here the reason is required:
 * a task that leaves the plan should say why, for whoever reads the record
 * later (often the same person, a month on).
 *
 * The suggestions are one tap each and fill the box; the writer's own
 * words always win. What happens to the task's time is said up front:
 * unfinished slots leave the planner, finished ones stay as work done.
 */
export function CancelTaskDialog({ task, events, projectName, timezone, onClose, onSaved }: CancelTaskDialogProps) {
  const { toast } = useNotifications();
  const editing = task.status === 'CANCELLED';
  const [reason, setReason] = useState(task.cancelReason || '');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const { open, done } = useMemo(() => {
    const mine = events.filter((e) => e.taskId === task.id);
    return { open: mine.filter((e) => !e.completed).length, done: mine.filter((e) => e.completed).length };
  }, [events, task.id]);

  const planned = (() => {
    try {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(task.date));
      return new Date(`${key}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    } catch {
      return null;
    }
  })();
  const hours = task.estimatedTime && task.estimatedTime > 0
    ? (task.estimatedTime < 1 ? `${Math.round(task.estimatedTime * 60)}m` : `${Math.round(task.estimatedTime * 10) / 10}h`)
    : null;

  const cleaned = cleanCancelReason(reason);
  const missing = tried && !cleaned;

  const save = async () => {
    setTried(true);
    if (!cleaned) { reasonRef.current?.focus(); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { cancelReason: cleaned } : { status: 'CANCELLED', cancelReason: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast('Not saved', res.status === 404 || res.status === 403 ? 'You can’t change this task.' : body.error || 'Try again.', 'error');
        return;
      }
      onSaved(await res.json());
      onClose();
    } catch {
      toast('Not saved', 'Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const priorityRule =
    task.priority === 'CRITICAL' ? 'bg-danger' : task.priority === 'HIGH' ? 'bg-warning' : 'bg-border-strong';

  return (
    <Modal onClose={onClose} size="sm" initialFocusRef={reasonRef}>
      <Modal.Header
        title={editing ? 'Why it was cancelled' : 'Cancel this task?'}
        onClose={onClose}
        icon={<CircleSlash className="h-5 w-5 text-danger" aria-hidden="true" />}
      />
      <Modal.Body>
        {/* The task itself, so it's clear what is being dropped. */}
        <div className="relative overflow-hidden rounded-[10px] border border-border bg-surface-raised py-3 pl-4 pr-3">
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${priorityRule}`} />
          <p className="font-serif text-[16.5px] font-medium leading-snug text-foreground">{task.name}</p>
          <p className="mt-1 text-[12.5px] text-ink-secondary tabular-nums">
            {[planned && `Planned for ${planned}`, hours, projectName].filter(Boolean).join(' · ')}
          </p>
          {!editing && (open > 0 || done > 0) && (
            <p className="mt-2.5 flex items-start gap-1.5 border-t border-border pt-2.5 text-[12.5px] leading-snug text-ink-secondary">
              <Clock3 className="mt-[2px] h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                {open > 0 && <>Its {open === 1 ? 'unfinished time slot leaves' : `${open} unfinished time slots leave`} your planner.</>}
                {open > 0 && done > 0 && ' '}
                {done > 0 && <>Time already ticked off stays as work done.</>}
              </span>
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-foreground">
            Why {editing ? 'was it' : 'are you'} cancelling it? <span className="font-normal text-ink-faint">(required)</span>
          </legend>
          <div className="mb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Suggested reasons">
            {CANCEL_REASONS.map((r) => {
              const on = cleaned === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setReason(on ? '' : r); reasonRef.current?.focus(); }}
                  className={`h-7 rounded-full border px-2.5 text-[12.5px] transition-colors active:translate-y-px ${
                    on
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-surface text-ink-secondary hover:border-border-strong hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <label htmlFor="cancel-task-reason" className="sr-only">Reason</label>
          <textarea
            id="cancel-task-reason"
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }}
            rows={3}
            maxLength={CANCEL_REASON_MAX}
            placeholder="Or in your own words: what changed?"
            aria-invalid={missing || undefined}
            aria-describedby={missing ? 'cancel-task-reason-error' : 'cancel-task-reason-hint'}
            className={`w-full resize-none rounded-[9px] border bg-surface-raised px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground placeholder-ink-faint focus:outline-none ${
              missing ? 'border-danger focus:border-danger' : 'border-border focus:border-border-strong'
            }`}
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-[12px]">
            {missing ? (
              <p id="cancel-task-reason-error" role="alert" className="text-danger">Add a reason, or pick one above.</p>
            ) : (
              <p id="cancel-task-reason-hint" className="text-ink-faint">
                {editing ? 'The reason shows with the task under Cancelled.' : 'It moves to Tasks → Cancelled with this reason. You can restore it any time.'}
              </p>
            )}
            <span className="shrink-0 tabular-nums text-ink-faint" aria-hidden="true">{reason.length}/{CANCEL_REASON_MAX}</span>
          </div>
        </fieldset>
      </Modal.Body>
      <Modal.Footer className="items-center">
        <button type="button" onClick={onClose} disabled={saving} className="px-3.5 py-2 text-[13px] font-semibold text-ink-secondary hover:text-foreground disabled:opacity-50">
          {editing ? 'Close' : 'Keep task'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-[9px] bg-[color-mix(in_srgb,var(--color-danger)_72%,#000)] px-3.5 py-2 text-[13px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save reason' : 'Cancel task'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
