'use client';

import React, { useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

/**
 * The form vocabulary shared by sign-in, sign-up and recovery: one field
 * shape (label, control, hint-or-error underneath), one button, one notice.
 * Errors are wired to the control with aria-describedby / aria-invalid so a
 * screen reader announces them with the field.
 */

export const controlClass =
  'auth-control w-full h-11 rounded-[10px] border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:outline-none';

interface FieldProps {
  label: string;
  /** Right-aligned beside the label - e.g. "Forgot password?" */
  aside?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

export function Field({ label, aside, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const hasNote = Boolean(error || hint);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
          {optional && <span className="ml-1.5 font-normal text-ink-faint">optional</span>}
        </label>
        {aside}
      </div>
      {children({ id, describedBy: hasNote ? noteId : undefined, invalid: Boolean(error) })}
      {error ? (
        <p id={noteId} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-danger" role="alert">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <div id={noteId} className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">{hint}</div>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function TextInput({ invalid, className = '', ...rest }: InputProps) {
  return <input {...rest} aria-invalid={invalid || undefined} className={`${controlClass} ${className}`} />;
}

export function PasswordInput({ invalid, className = '', ...rest }: InputProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        type={shown ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        className={`${controlClass} pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-ink-faint transition-colors hover:text-foreground"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({ busy, children, busyLabel }: { busy: boolean; children: React.ReactNode; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className="auth-submit relative flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:translate-y-px disabled:cursor-progress disabled:opacity-80"
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" aria-hidden="true" />}
      <span>{busy ? busyLabel : children}</span>
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const styles = {
    error: 'border-danger/30 bg-danger-soft text-danger',
    success: 'border-success/30 bg-success-soft text-success',
    info: 'border-border bg-surface-raised text-ink-secondary',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-6 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13.5px] leading-snug ${styles}`}>
      <Icon className="mt-[1px] h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** Live checklist under a new-password field: quiet until typed into, then ticks as rules are met. */
export function PasswordRules({ password }: { password: string }) {
  const long = password.length >= 10;
  return (
    <span className={`inline-flex items-center gap-1.5 transition-colors ${long ? 'text-success' : ''}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${long ? 'bg-success' : 'bg-border-strong'}`}
        aria-hidden="true"
      />
      At least 10 characters{password.length > 0 && !long ? ` · ${10 - password.length} to go` : ''}
    </span>
  );
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
