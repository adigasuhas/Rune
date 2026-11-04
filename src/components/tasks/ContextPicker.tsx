'use client';

import React, { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { MAX_CONTEXTS, MAX_CONTEXT_LENGTH, STANDARD_CONTEXTS, contextLabel, isStandardContext, normalizeContext, parseContexts } from '@/lib/taskContext';

/**
 * Pick any number of contexts for a task: the standard ones, contexts the
 * writer has used before, and new ones typed in place. Each is a toggle
 * (a pressed button), so the whole set reads at a glance and works from
 * the keyboard; a typed context is added with Enter or a comma.
 */
export function ContextPicker({
  value,
  onChange,
  suggestions = [],
  labelClass = '',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Contexts used on other tasks, offered alongside the standard ones. */
  suggestions?: string[];
  labelClass?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const picked = parseContexts(value);
  const full = picked.length >= MAX_CONTEXTS;

  // Standard ones first, then the writer's own (used before, or picked now).
  const own = parseContexts([...suggestions, ...picked]).filter((c) => !isStandardContext(c));
  const options = [...STANDARD_CONTEXTS.map((s) => s.value as string), ...own];

  const toggle = (c: string) => {
    if (picked.includes(c)) onChange(picked.filter((p) => p !== c));
    else if (!full) onChange([...picked, c]);
  };

  const addDraft = (text: string = draft) => {
    const c = normalizeContext(text);
    setDraft('');
    if (!c || picked.includes(c) || full) return;
    onChange([...picked, c]);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span id={`${id}-label`} className={labelClass}>Context</span>
        <span className="text-[11.5px] tabular-nums text-ink-faint" aria-live="polite">
          {picked.length === 0 ? 'Pick any that apply' : `${picked.length} picked${full ? ' · the most a task can have' : ''}`}
        </span>
      </div>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
        {options.map((c) => {
          const on = picked.includes(c);
          const custom = !isStandardContext(c);
          return (
            <span key={c} className="inline-flex">
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggle(c)}
                className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[12.5px] transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${
                  custom && on ? 'rounded-l-full border-r-0 pr-2' : 'rounded-full'
                } ${
                  on
                    ? 'border-foreground bg-foreground font-medium text-background'
                    : 'border-border bg-surface text-ink-secondary hover:border-border-strong hover:text-foreground'
                }`}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {contextLabel(c)}
              </button>
              {/* A context of the writer's own, once picked, can be dropped in one go. */}
              {custom && on && (
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  aria-label={`Remove ${contextLabel(c)}`}
                  className="inline-flex h-8 items-center rounded-r-full border border-l-0 border-foreground bg-foreground pl-0.5 pr-2 text-background/70 hover:text-background"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
          );
        })}

        {/* New context, typed in place. */}
        <label className={`inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-2.5 text-[12.5px] transition-colors focus-within:border-foreground focus-within:border-solid ${full ? 'border-border/60 opacity-50' : 'border-border-strong'}`}>
          <Plus className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <span className="sr-only">Add your own context</span>
          <input
            type="text"
            value={draft}
            disabled={full}
            maxLength={MAX_CONTEXT_LENGTH}
            onChange={(e) => {
              const v = e.target.value;
              // A comma finishes one, like Enter.
              if (v.includes(',')) { addDraft(v.replace(/,/g, '')); return; }
              setDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addDraft(); }
              else if (e.key === 'Backspace' && !draft && picked.length) {
                // Backspace on an empty box un-picks the last one, as in any tag field.
                onChange(picked.slice(0, -1));
              }
            }}
            onBlur={() => addDraft()}
            placeholder="Add your own"
            className="w-[7.5rem] border-0 bg-transparent p-0 text-foreground placeholder-ink-faint shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          />
        </label>
      </div>
    </div>
  );
}
