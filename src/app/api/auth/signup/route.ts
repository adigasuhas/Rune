import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { hashPassword } from '@/lib/crypto';
import { checkSignupAllowed, validatePassword } from '@/lib/authConfig';
import { getRecoveryQuestion, hashAnswer, validateAnswer } from '@/lib/recovery';
import { dbErrorResponse } from '@/lib/dbErrors';

function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(300),
  name: z.string().trim().max(120).optional(),
  recoveryQuestion: z.string().max(64).optional(),
  recoveryAnswer: z.string().max(300).optional(),
  timezone: z.string().max(100).optional(),
});

/**
 * Account creation with email + password - the only way in, needing nothing
 * outside the app. Who may sign up is a deployment setting
 * (RUNE_SIGNUP_MODE, see authConfig.ts); it only gates creating NEW
 * accounts, never existing ones.
 *
 * A recovery question + answer is required: with no mail server guaranteed,
 * it's how a person gets back in after forgetting their password (see
 * src/lib/recovery.ts and /api/auth/recovery/*).
 *
 * There is no email-verification step (a self-hosted install may have no
 * mail server), so an address here is unverified - see
 * docs/ADMINISTRATOR_GUIDE.md for what that means in practice.
 */
export async function POST(req: NextRequest) {
  // Two independent limits: per client, and per address (so one account
  // can't be probed from many IPs, nor one IP mass-register).
  const limited = enforceRateLimit(req, 'auth-signup', 10, 60 * 60_000);
  if (limited) return limited;

  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address and a password.' }, { status: 400 });
  }
  const { email, password, name, recoveryQuestion, recoveryAnswer, timezone } = parsed.data;

  const perEmail = enforceRateLimit(req, 'auth-signup-email', 5, 60 * 60_000, email);
  if (perEmail) return perEmail;

  const decision = checkSignupAllowed(email);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message, code: `signup_${decision.reason}` }, { status: 403 });
  }

  const passwordError = validatePassword(password, email);
  if (passwordError) {
    return NextResponse.json({ error: passwordError, field: 'password' }, { status: 400 });
  }

  if (!getRecoveryQuestion(recoveryQuestion)) {
    return NextResponse.json({ error: 'Choose a recovery question.', field: 'recoveryQuestion' }, { status: 400 });
  }
  const answerError = validateAnswer(recoveryAnswer ?? '', email);
  if (answerError) {
    return NextResponse.json({ error: answerError, field: 'recoveryAnswer' }, { status: 400 });
  }
  if (password && recoveryAnswer && password.trim().toLowerCase() === recoveryAnswer.trim().toLowerCase()) {
    return NextResponse.json({ error: 'Use something other than your password as the answer.', field: 'recoveryAnswer' }, { status: 400 });
  }

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
    }

    const user = await db.user.create({
      data: {
        email,
        name: name || null,
        passwordHash: hashPassword(password),
        recoveryQuestion,
        recoveryAnswerHash: hashAnswer(recoveryAnswer!),
        // The browser's zone, if it's one Intl recognises; otherwise the schema default (UTC).
        ...(isValidTimeZone(timezone) ? { timezone } : {}),
        lastLogin: new Date(),
        // No stored avatar: everyone gets a default cartoon from their id (src/lib/avatars.ts).
      },
    });

    await setSessionCookie({ userId: user.id, email: user.email, name: user.name || undefined, sv: user.sessionVersion ?? 0 });

    // ClientLayout sends a not-yet-onboarded user to /onboarding.
    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    // Two simultaneous sign-ups for one address: the unique index wins.
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
    }
    const dbDown = dbErrorResponse(err, 'signup');
    if (dbDown) return dbDown;
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
