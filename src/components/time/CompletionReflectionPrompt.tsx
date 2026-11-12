'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { REFLECTION_PROMPTS, type ReflectionKey } from '@/lib/projectTimeSheet';
import { EDIT_REFLECTION, TASK_COMPLETED, type CompletedTaskDetail } from '@/lib/taskCompletion';

type Answers = Record<ReflectionKey, string>;
const EMPTY: Answers = { productiveMoment: '', timeWaster: '', gladFinished: '', improvement: '', planningRealistic: '', lesson: '' };

/** Fired after a reflection is saved, so the time sheet can show it. */
export const REFLECTION_SAVED = 'rune-reflection-saved';

/**
 * The time sheet's Reflection block, asked once a task moves to Done (and
 * only then). It sits at the foot of the screen without blocking anything:
 * every line is optional, "Not now" closes it, and the same reflection opens
 * again for editing from the time sheet. Finishing a task a second time
 * opens what was written before - there is only ever one per task.
 */
export function CompletionReflectionPrompt() {
  const { user } = useSession();
  const { toast } = useNotifications();
  const [task, setTask] = useState<(CompletedTaskDetail & { editing: boolean; completedOn?: string }) | null>(null);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [state, setState] = useState<'loading' | 'ready' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const open = (editing: boolean) => async (e: Event) => {
      const detail = (e as CustomEvent<CompletedTaskDetail>).detail;
      if (!detail?.taskId) return;
      const req = ++requestRef.current;
      setTask(null);
      setError(null);
      setState('loading');
      try {
        const res = await fetch(`/api/reflections/${detail.taskId}`);
        // Someone else's task (a teammate's, on a shared project): theirs to reflect on.
        if (!res.ok) return;
        const existing = await res.json();
        if (req !== requestRef.current) return;
        setAnswers(
          existing
            ? (Object.fromEntries(REFLECTION_PROMPTS.map(p => [p.key, existing[p.key] ?? ''])) as Answers)
            : EMPTY
        );
        setTask({ ...detail, editing, completedOn: existing?.completedOn });
        setState('ready');
      } catch {
        /* offline: don't nag */
      }
    };
    const onDone = open(false);
    const onEdit = open(true);
    window.addEventListener(TASK_COMPLETED, onDone);
    window.addEventListener(EDIT_REFLECTION, onEdit);
    return () => {
      window.removeEventListener(TASK_COMPLETED, onDone);
      window.removeEventListener(EDIT_REFLECTION, onEdit);
    };
  }, []);

  useEffect(() => {
    if (task && state === 'ready' && task.editing) firstRef.current?.focus();
  }, [task, state]);

  if (!task || !user) return null;

  const close = () => setTask(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('saving');
    setError(null);
    try {
      const completedOn = task.editing ? undefined : getCurrentDateInTimezone(user.timezone || 'UTC');
      const res = await fetch(`/api/reflections/${task.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...answers, ...(completedOn ? { completedOn } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That didn’t save. Try again.');
        setState('ready');
        return;
      }
      window.dispatchEvent(new Event(REFLECTION_SAVED));
      toast('Reflection saved', 'It’s on the project’s time sheet in Analytics.', 'success');
      close();
    } catch {
      setError('You seem to be offline. Try again.');
      setState('ready');
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="reflection-title"
      onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-h-[calc(100dvh-1.5rem)] max-w-[34rem] overflow-y-auto rounded-[14px] border border-border bg-card shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)] sm:bottom-5"
    >
      <form onSubmit={save}>
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-faint">REFLECTION</p>
            <h2 id="reflection-title" className="mt-0.5 truncate font-serif text-[19px] font-medium leading-snug text-foreground">
              {task.editing ? task.name : <>Done: {task.name}</>}
            </h2>
            {!task.editing && <p className="text-[13px] text-ink-secondary">A line or two for the time sheet. All optional.</p>}
          </div>
          <button type="button" onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <ol className="px-5">
          {REFLECTION_PROMPTS.map((p, i) => (
            <li key={p.key} className="flex flex-col gap-0.5 border-b border-border py-2 sm:flex-row sm:items-baseline sm:gap-3">
              <label htmlFor={`reflection-${p.key}`} className="shrink-0 text-[12.5px] font-semibold text-foreground sm:w-[13.5rem]">
                {i + 1}. {p.label} :
              </label>
              <input
                ref={i === 0 ? firstRef : undefined}
                id={`reflection-${p.key}`}
                value={answers[p.key]}
                onChange={(e) => setAnswers({ ...answers, [p.key]: e.target.value })}
                maxLength={2000}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent py-0.5 text-[14px] text-foreground placeholder:text-ink-faint focus:outline-none"
              />
            </li>
          ))}
        </ol>

        {error && <p role="alert" className="px-5 pt-2 text-[13px] text-danger">{error}</p>}

        <footer className="flex items-center justify-end gap-2 px-5 pb-4 pt-3">
          <button type="button" onClick={close} className="h-9 rounded-[9px] px-3 text-[14px] font-semibold text-ink-secondary hover:bg-surface-sunken hover:text-foreground">
            {task.editing ? 'Cancel' : 'Not now'}
          </button>
          <button type="submit" disabled={state === 'saving'} className="h-9 rounded-[9px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
            {state === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </section>
  );
}
