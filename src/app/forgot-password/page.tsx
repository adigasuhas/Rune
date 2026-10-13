'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell, TextLink } from '@/components/auth/AuthShell';
import { AuthAside } from '@/components/auth/AuthAside';
import { EMAIL_RE, Field, Notice, PasswordInput, PasswordRules, SubmitButton, TextInput } from '@/components/auth/AuthFields';

type Step = 'email' | 'answer' | 'password';

const STEPS: Step[] = ['email', 'answer', 'password'];

/**
 * Secret-question recovery, in three steps on one page:
 *   1. email          -> /api/auth/recovery/question  (always returns a question)
 *   2. answer         -> /api/auth/recovery/verify    (returns a 15-minute reset token)
 *   3. new password   -> /api/auth/reset-password     (consumes the token, signs out other sessions)
 * The reset token lives only in this component's memory - never in the URL.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailReset, setEmailReset] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setEmailReset(Boolean(c?.emailReset)))
      .catch(() => {});
  }, []);

  // Move focus to the new step's first control so keyboard and screen-reader
  // users land where the page changed.
  useEffect(() => {
    headingRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, [step]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const go = (next: Step) => {
    setFieldError(null);
    setFormError(null);
    setStep(next);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setFieldError('Enter the email address you signed up with.'); return; }
    setBusy(true); setFormError(null);
    try {
      const { ok, data } = await post('/api/auth/recovery/question', { email: email.trim() });
      if (ok && data.question) { setQuestion(data.question.text); setAnswer(''); go('answer'); }
      else setFormError(data.error || 'Couldn’t look that up. Try again.');
    } catch {
      setFormError('Couldn’t reach Rune. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) { setFieldError('Enter your answer.'); return; }
    setBusy(true); setFormError(null);
    try {
      const { ok, status, data } = await post('/api/auth/recovery/verify', { email: email.trim(), answer });
      if (ok && data.token) { setToken(data.token); go('password'); }
      else if (status === 400) setFieldError(data.error || 'That answer doesn’t match.');
      else setFormError(data.error || 'Something went wrong. Try again.');
    } catch {
      setFormError('Couldn’t reach Rune. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null); setConfirmError(null); setFormError(null);
    if (password.length < 10) { setFieldError('Use at least 10 characters.'); return; }
    if (password !== confirm) { setConfirmError('These don’t match yet.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await post('/api/auth/reset-password', { token, newPassword: password });
      if (ok && data.success) { router.push('/login?reset=1'); return; }
      if (/expired|invalid/i.test(data.error || '')) {
        setToken(null);
        setFormError('That took a little too long and the reset window closed. Answer your question again to get a fresh one.');
        setStep('answer');
      } else setFieldError(data.error || 'Couldn’t save that password. Try another.');
    } catch {
      setFormError('Couldn’t reach Rune. Check your connection and try again.');
    }
    setBusy(false);
  };

  const sendEmailLink = async () => {
    setBusy(true);
    try {
      const { data } = await post('/api/auth/forgot-password', { email: email.trim() });
      setEmailNotice(data.message || data.error || 'If that address has an account, a reset link is on its way.');
    } finally { setBusy(false); }
  };

  const index = STEPS.indexOf(step);
  const titles: Record<Step, string> = {
    email: 'Forgot your password?',
    answer: 'Answer your recovery question',
    password: 'Choose a new password',
  };
  const subtitles: Record<Step, React.ReactNode> = {
    email: 'It happens. Tell us which account, and we’ll ask the question you picked when you signed up.',
    answer: <>For <span className="font-medium text-foreground">{email.trim()}</span>. Capitals and punctuation don’t matter.</>,
    password: 'Last step. This signs you out on every other device.',
  };

  return (
    <AuthShell
      aside={<AuthAside />}
      title={titles[step]}
      subtitle={subtitles[step]}
      footer={<>Remembered it? <TextLink href="/login">Back to sign in</TextLink></>}
    >
      <ol className="mb-7 flex items-center gap-2" aria-label={`Step ${index + 1} of 3`}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= index ? 'bg-primary' : 'bg-border-strong/60'}`}
            aria-current={i === index ? 'step' : undefined}
          />
        ))}
      </ol>

      {formError && <Notice tone="error">{formError}</Notice>}

      <div ref={headingRef} key={step} className="auth-enter">
        {step === 'email' && (
          <form onSubmit={submitEmail} noValidate className="space-y-5">
            <Field label="Email" error={fieldError}>
              {({ id, describedBy, invalid }) => (
                <TextInput id={id} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
                  aria-describedby={describedBy} invalid={invalid} placeholder="you@university.edu" />
              )}
            </Field>
            <SubmitButton busy={busy} busyLabel="Looking up…">Continue</SubmitButton>
          </form>
        )}

        {step === 'answer' && (
          <form onSubmit={submitAnswer} noValidate className="space-y-5">
            <div className="rounded-[12px] border border-border bg-surface-raised/60 px-4 py-3.5">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">Your question</p>
              <p className="mt-1 text-[16px] font-medium leading-snug text-foreground">{question}</p>
            </div>
            <Field label="Answer" error={fieldError}>
              {({ id, describedBy, invalid }) => (
                <TextInput id={id} type="text" autoComplete="off" spellCheck={false}
                  value={answer} onChange={(e) => { setAnswer(e.target.value); setFieldError(null); }}
                  aria-describedby={describedBy} invalid={invalid} maxLength={200} />
              )}
            </Field>
            <SubmitButton busy={busy} busyLabel="Checking…">Verify answer</SubmitButton>
            <details className="group text-[13px] text-ink-secondary">
              <summary className="cursor-pointer list-none font-medium text-ink-secondary underline-offset-4 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden">
                Don’t recognise this question?
              </summary>
              <div className="mt-2 space-y-2 leading-relaxed text-ink-faint">
                <p>
                  Check the email address for typos (<TextLink onClick={() => go('email')}>change it</TextLink>). Accounts created before
                  recovery questions existed, or by an administrator, may not have one. In that case, the person who runs this Rune
                  server can reset it with <code className="rounded bg-surface-sunken px-1 py-0.5 text-[12px]">npm run reset-password</code>.
                </p>
                {emailReset && (
                  emailNotice
                    ? <p className="text-ink-secondary">{emailNotice}</p>
                    : <p>Or <TextLink onClick={sendEmailLink}>email me a reset link instead</TextLink>.</p>
                )}
              </div>
            </details>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword} noValidate className="space-y-5">
            <Field label="New password" error={fieldError} hint={<PasswordRules password={password} />}>
              {({ id, describedBy, invalid }) => (
                <PasswordInput id={id} autoComplete="new-password" value={password}
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
        )}
      </div>
    </AuthShell>
  );
}

export const dynamic = 'force-dynamic';
