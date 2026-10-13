'use client';

import React, { useEffect, useId, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { getRecoveryQuestion } from '@/lib/recoveryQuestions';
import { RecoveryQuestionSelect } from '@/components/auth/RecoveryQuestionSelect';

const inputClass =
  'w-full bg-surface border border-border-strong rounded-md px-3 py-1.5 text-foreground placeholder-ink-faint text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 transition-colors';

/** Settings › Advanced: set or change the question used by "Forgot password". */
export function RecoveryQuestionSettings() {
  const { user, refreshSession } = useSession();
  const { toast } = useNotifications();
  const selectId = useId();
  const [currentId, setCurrentId] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [questionId, setQuestionId] = useState('');
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/recovery')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrentId(d?.questionId ?? null))
      .catch(() => setCurrentId(null));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!questionId) { setError('Choose a question.'); return; }
    if (answer.trim().length < 2) { setError('Enter an answer you’ll remember.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/user/recovery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer, currentPassword: user?.hasPassword ? password : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Couldn’t save that. Try again.'); return; }
      setCurrentId(data.questionId);
      setEditing(false);
      setAnswer(''); setPassword('');
      toast('Recovery question saved', 'You can use it from “Forgot password” on the sign-in page.', 'success');
      refreshSession();
    } catch {
      setError('Couldn’t reach Rune. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const current = getRecoveryQuestion(currentId);

  return (
    <div className="border-t border-border/50 pt-5 space-y-3">
      <h4 className="text-xs font-semibold text-foreground">Recovery question</h4>
      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-sm">
        {currentId === undefined
          ? 'Loading…'
          : current
            ? <>Used if you forget your password. Current question: <span className="text-foreground">{current.text}</span></>
            : <span className="text-warning">Not set. Without one, a forgotten password needs your server’s administrator to reset it.</span>}
      </p>
      {!editing ? (
        currentId !== undefined && (
          <button
            type="button"
            onClick={() => { setEditing(true); setQuestionId(current?.id ?? ''); }}
            className="px-3.5 py-1.5 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-foreground text-[10px] font-bold rounded-full transition-colors cursor-pointer"
          >
            {current ? 'Change question or answer' : 'Set a recovery question'}
          </button>
        )
      ) : (
        <form onSubmit={save} className="space-y-2 max-w-sm">
          <label htmlFor={selectId} className="sr-only">Recovery question</label>
          <RecoveryQuestionSelect id={selectId} value={questionId} onChange={setQuestionId} />
          <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" autoComplete="off" spellCheck={false} maxLength={200} className={inputClass} aria-label="Your answer" />
          {user?.hasPassword && (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password, to confirm it’s you" autoComplete="current-password" className={inputClass} aria-label="Current password" />
          )}
          {error && <p className="text-danger text-[10px] font-semibold" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-[10px] font-bold rounded-full transition-colors cursor-pointer disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="px-3.5 py-1.5 text-ink-secondary hover:text-foreground text-[10px] font-bold rounded-full cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
