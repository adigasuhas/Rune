'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, TextLink } from '@/components/auth/AuthShell';
import { AuthAside } from '@/components/auth/AuthAside';
import { Field, Notice, PasswordInput, PasswordRules, SubmitButton } from '@/components/auth/AuthFields';

/** Landing page for an emailed (or administrator-relayed) reset link. The recovery-question path does its reset inline on /forgot-password. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null); setConfirmError(null); setFormError(null);
    if (password.length < 10) { setFieldError('Use at least 10 characters.'); return; }
    if (password !== confirm) { setConfirmError('These don’t match yet.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) { router.push('/login?reset=1'); return; }
      if (/expired|invalid/i.test(data.error || '')) setFormError(data.error);
      else setFieldError(data.error || 'Couldn’t save that password. Try another.');
    } catch {
      setFormError('Couldn’t reach Rune. Check your connection and try again.');
    }
    setBusy(false);
  };

  if (!token) {
    return (
      <AuthShell
        aside={<AuthAside />}
        title="This link is incomplete"
        subtitle="The reset link is missing its code. It may have been cut off when it was copied."
        footer={<TextLink href="/forgot-password">Start password recovery again</TextLink>}
      >
        <span />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside={<AuthAside />}
      title="Choose a new password"
      subtitle="This signs you out on every other device."
      footer={<>Changed your mind? <TextLink href="/login">Back to sign in</TextLink></>}
    >
      {formError && (
        <Notice tone="error">
          {formError} <TextLink href="/forgot-password">Start again</TextLink>
        </Notice>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="New password" error={fieldError} hint={<PasswordRules password={password} />}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" value={password} autoFocus
              onChange={(e) => { setPassword(e.target.value); setFieldError(null); }}
              aria-describedby={describedBy} invalid={invalid} />
          )}
        </Field>
        <Field label="Confirm new password" error={confirmError}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setConfirmError(null); }}
              aria-describedby={describedBy} invalid={invalid} />
          )}
        </Field>
        <SubmitButton busy={busy} busyLabel="Saving…">Save new password</SubmitButton>
      </form>
    </AuthShell>
  );
}

export const dynamic = 'force-dynamic';
