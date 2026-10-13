'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { RECOVERY_QUESTIONS } from '@/lib/recoveryQuestions';
import { controlClass } from './AuthFields';

const classic = RECOVERY_QUESTIONS.filter((q) => !q.playful);
const playful = RECOVERY_QUESTIONS.filter((q) => q.playful);

/** A native <select> (keyboard, screen readers and mobile pickers for free), grouped classic / playful. */
export function RecoveryQuestionSelect({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${controlClass} cursor-pointer appearance-none pr-10 ${value ? '' : 'text-ink-faint'}`}
      >
        <option value="" disabled>
          Choose a question…
        </option>
        <optgroup label="The classics">
          {classic.map((q) => (
            <option key={q.id} value={q.id}>{q.text}</option>
          ))}
        </optgroup>
        <optgroup label="The honest ones">
          {playful.map((q) => (
            <option key={q.id} value={q.id}>{q.text}</option>
          ))}
        </optgroup>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
    </div>
  );
}
