'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/context/SessionContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, TextLink } from '@/components/auth/AuthShell';
import { AuthAside } from '@/components/auth/AuthAside';
import { EMAIL_RE, Field, Notice, PasswordInput, PasswordRules, SubmitButton, TextInput } from '@/components/auth/AuthFields';
import { RecoveryQuestionSelect } from '@/components/auth/RecoveryQuestionSelect';
import { MIN_ANSWER_LENGTH } from '@/lib/recoveryQuestions';

interface AuthConfig {
  signup: 'open' | 'domains' | 'closed';
}

type Mode = 'signin' | 'signup';
type FieldName = 'name' | 'email' | 'password' | 'recoveryQuestion' | 'recoveryAnswer';
type Errors = Partial<Record<FieldName, string>>;

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}

/** Mirrors the server's checks so most mistakes are caught before a round trip; the server stays authoritative. */
function validate(mode: Mode, v: { email: string; password: string; question: string; answer: string }): Errors {
  const e: Errors = {};
  if (!v.email.trim()) e.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'That doesn’t look like an email address.';
  if (!v.password) e.password = mode === 'signup' ? 'Choose a password.' : 'Enter your password.';
  else if (mode === 'signup' && v.password.length < 10) e.password = 'Use at least 10 characters.';
  if (mode === 'signup') {
    if (!v.question) e.recoveryQuestion = 'Choose a recovery question.';
    if (v.answer.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_ANSWER_LENGTH) e.recoveryAnswer = 'Enter an answer you’ll remember.';
  }
  return e;
}

function LoginForm() {
  const { user, login, loading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  // Only forward same-origin relative paths - never let this become an
  // open redirect via a crafted ?redirect= value.
  const redirectParam = searchParams.get('redirect');
  const safeRedirect = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
    ? redirectParam
    : null;

  useEffect(() => {
    // Already signed in (e.g. opened /login in a second tab) - go on through.
    if (user && !loading && !submitting) router.replace(safeRedirect || '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // What this deployment offers (who may sign up) - an operator setting,
  // so fetched rather than baked into the build.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c: AuthConfig | null) => { if (!cancelled && c) setConfig(c); })
      .catch(() => { /* fall back to the plain form */ });
    return () => { cancelled = true; };
  }, []);

  const signupOpen = config ? config.signup !== 'closed' : true;
  const effectiveMode: Mode = mode === 'signup' && !signupOpen ? 'signin' : mode;
  const isSignup = effectiveMode === 'signup';
  const justReset = searchParams.get('reset') === '1';

  const switchMode = (next: Mode) => {
    setMode(next);
    setFormError(null);
    setErrors({});
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'signup') params.set('mode', 'signup'); else params.delete('mode');
    params.delete('reset');
    router.replace(`/login${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };

  const clearError = (f: FieldName) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = validate(effectiveMode, { email, password, question, answer });
    setErrors(found);
    const first = (Object.keys(found) as FieldName[])[0];
    if (first) {
      document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] select`)?.focus();
      return;
    }

    setSubmitting(true);
    const result = isSignup
      ? await login(email.trim(), password, {
          endpoint: '/api/auth/signup',
          extra: { name: name.trim() || undefined, recoveryQuestion: question, recoveryAnswer: answer, timezone: browserTimeZone() },
          redirectTo: safeRedirect || undefined,
        })
      : await login(email.trim(), password, { redirectTo: safeRedirect || undefined });

    if (!result.success) {
      const field = result.field as FieldName | undefined;
      if (field && ['email', 'password', 'recoveryQuestion', 'recoveryAnswer'].includes(field)) {
        setErrors({ [field]: result.error });
      } else {
        setFormError(result.error || 'Something went wrong. Try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      aside={<AuthAside />}
      title={isSignup ? 'Create your Rune account' : 'Welcome back'}
      subtitle={
        isSignup
          ? 'Free, no card, no trial clock. Takes about a minute.'
          : 'Sign in to pick up where you left off.'
      }
      footer={
        isSignup ? (
          <>Already have an account? <TextLink onClick={() => switchMode('signin')}>Sign in</TextLink></>
        ) : signupOpen ? (
          <>New to Rune? <TextLink onClick={() => switchMode('signup')}>Create an account</TextLink></>
        ) : (
          <>Accounts on this server are created by its administrator.</>
        )
      }
    >
      {formError ? (
        <Notice tone="error">{formError}</Notice>
      ) : justReset && !isSignup ? (
        <Notice tone="success">Password updated. Sign in with your new one.</Notice>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {isSignup && (
          <div data-field="name">
            <Field label="Name" optional>
              {({ id }) => (
                <TextInput id={id} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="What should Rune call you?" />
              )}
            </Field>
          </div>
        )}

        <div data-field="email">
          <Field label="Email" error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="email"
                inputMode="email"
                autoComplete={isSignup ? 'email' : 'username'}
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="you@university.edu"
              />
            )}
          </Field>
        </div>

        <div data-field="password">
          <Field
            label="Password"
            error={errors.password}
            hint={isSignup ? <PasswordRules password={password} /> : undefined}
            aside={!isSignup ? <a href="/forgot-password" className="text-[13px] font-medium text-ink-secondary underline-offset-4 hover:text-foreground hover:underline">Forgot password?</a> : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        {isSignup && (
          <fieldset className="space-y-4 rounded-[12px] border border-border bg-surface-raised/60 p-4">
            <legend className="sr-only">Account recovery</legend>
            <div>
              <p className="text-[13px] font-medium text-foreground">If you ever forget your password</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
                Rune will ask you this instead of sending an email. Your answer is hashed like a password. Nobody can read it back, including us.
              </p>
            </div>
            <div data-field="recoveryQuestion">
              <Field label="Recovery question" error={errors.recoveryQuestion}>
                {({ id, describedBy, invalid }) => (
                  <RecoveryQuestionSelect id={id} value={question} onChange={(v) => { setQuestion(v); clearError('recoveryQuestion'); }} describedBy={describedBy} invalid={invalid} />
                )}
              </Field>
            </div>
            <div data-field="recoveryAnswer">
              <Field label="Your answer" error={errors.recoveryAnswer} hint="Capitals, spaces and punctuation don’t matter. Pick something you’ll answer the same way next year.">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={answer}
                    onChange={(e) => { setAnswer(e.target.value); clearError('recoveryAnswer'); }}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    maxLength={200}
                  />
                )}
              </Field>
            </div>
          </fieldset>
        )}

        <div className="pt-1">
          <SubmitButton busy={submitting} busyLabel={isSignup ? 'Creating your account…' : 'Signing in…'}>
            {isSignup ? 'Create account' : 'Sign in'}
          </SubmitButton>
        </div>

        {isSignup && config?.signup === 'domains' && (
          <p className="text-[12.5px] leading-relaxed text-ink-faint">Sign-up on this server is limited to approved email domains.</p>
        )}
      </form>
    </AuthShell>
  );
}

export const dynamic = 'force-dynamic';

function browserTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}
