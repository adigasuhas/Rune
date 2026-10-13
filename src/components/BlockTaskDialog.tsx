'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useNotifications } from '@/context/NotificationContext';

interface Teammate {
  id: string;
  name: string | null;
  email: string;
}

interface BlockTaskDialogProps {
  task: { id: string; name: string; status: string; blockedReason?: string | null; blockedOnUserId?: string | null };
  onClose: () => void;
  /** Called with the updated task after a successful save. */
  onSaved: (updated: any) => void;
}

/**
 * Marks a task BLOCKED (or edits an existing block), capturing a short reason
 * and optionally the teammate it is waiting on. Setting "waiting on" raises a
 * notification on that person's bell and surfaces the task in their dashboard
 * "Needs attention" - the dependency reaches the one person who can clear it.
 */
export function BlockTaskDialog({ task, onClose, onSaved }: BlockTaskDialogProps) {
  const { toast } = useNotifications();
  const isBlocked = task.status === 'BLOCKED';
  const [reason, setReason] = useState(task.blockedReason || '');
  const [blockedOnUserId, setBlockedOnUserId] = useState(task.blockedOnUserId || '');
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teammates')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setTeammates(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async (nextStatus: 'BLOCKED' | 'PENDING') => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          nextStatus === 'BLOCKED'
            ? { status: 'BLOCKED', blockedReason: reason.trim() || null, blockedOnUserId: blockedOnUserId || null }
            : { status: 'PENDING' }
        )
      });
      if (!res.ok) {
        toast('Not saved', res.status === 404 || res.status === 403 ? 'You cannot change this task.' : 'Try again.', 'error');
        return;
      }
      const updated = await res.json();
      onSaved(updated);
      toast(
        nextStatus === 'BLOCKED' ? 'Task blocked' : 'Task unblocked',
        nextStatus === 'BLOCKED'
          ? (blockedOnUserId
              ? `${teammates.find(t => t.id === blockedOnUserId)?.name || 'They'} will see it under Needs attention.`
              : 'Marked as waiting on something external.')
          : 'Back on your active list.',
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
    <Modal onClose={onClose} size="sm" initialFocusRef={reasonRef}>
      <Modal.Header title={isBlocked ? 'Edit block' : 'Mark blocked'} onClose={onClose} icon={<Ban className="w-5 h-5 text-[var(--color-data-slate)]" />} />
      <Modal.Body>
        <p className="text-[13px] text-ink-secondary leading-relaxed">
          A blocked task stays on your board but is set apart. If you name who it’s waiting on, it also appears in their Needs attention list.
        </p>
        <div>
          <label htmlFor="blocktaskdialog-what-is-it-waiting-on" className="block text-[12.5px] font-semibold text-ink-faint mb-1">What is it waiting on?</label>
          <textarea id="blocktaskdialog-what-is-it-waiting-on"
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. sample prep from the wet lab, cluster queue, review from advisor"
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
        </div>
        <div>
          <label htmlFor="blocktaskdialog-waiting-on-optional" className="block text-[12.5px] font-semibold text-ink-faint mb-1">Waiting on (optional)</label>
          <select id="blocktaskdialog-waiting-on-optional"
            value={blockedOnUserId}
            onChange={(e) => setBlockedOnUserId(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-border-strong"
          >
            <option value="">No one (external)</option>
            {teammates.map(t => (
              <option key={t.id} value={t.id}>{t.name || t.email}</option>
            ))}
          </select>
          {teammates.length === 0 && (
            <p className="text-[11px] text-ink-faint mt-1">Join a team to name a person here.</p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="items-center">
        {isBlocked && (
          <button
            type="button"
            onClick={() => save('PENDING')}
            disabled={saving}
            className="mr-auto text-[13px] font-semibold text-ink-secondary hover:text-foreground disabled:opacity-50"
          >
            Unblock
          </button>
        )}
        <button type="button" onClick={onClose} disabled={saving} className="px-3.5 py-2 text-[13px] font-semibold text-ink-secondary hover:text-foreground disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => save('BLOCKED')}
          disabled={saving}
          className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-[13px] font-semibold rounded-md disabled:opacity-50"
        >
          {isBlocked ? 'Save' : 'Mark blocked'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
