import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';
import { DUMMY_ANSWER_HASH, verifyAnswer } from '@/lib/recovery';
import { issuePasswordResetToken } from '@/lib/passwordReset';
import { dbErrorResponse } from '@/lib/dbErrors';

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(300),
  answer: z.string().min(1).max(300),
});

// Long enough to pick a password, short enough that an unattended tab isn't a standing key.
const RECOVERY_TOKEN_TTL_MS = 15 * 60_000;

const MISMATCH = 'That answer doesn’t match what we have on file. Check the spelling and try again.';

/**
 * Step 2 of secret-question recovery: check the answer and, if it matches,
 * hand back a short-lived one-time reset token. Step 3 is the existing
 * /api/auth/reset-password, which validates the new password, consumes the
 * token, and signs out every other session.
 *
 * Wrong answer, unknown email, and "no question set" all get the same
 * message after the same PBKDF2 work. Guessing is capped per address
 * (5 per 15 min) on top of the per-client cap.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'auth-recovery-verify', 10, 15 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your answer.' }, { status: 400 });
  }
  const { email, answer } = parsed.data;

  const perAccount = enforceRateLimit(req, 'auth-recovery-verify-email', 5, 15 * 60_000, email);
  if (perAccount) return perAccount;

  try {
    const user = await db.user.findUnique({ where: { email } });
    const usable = Boolean(user && !user.deletedAt && user.status === 'ACTIVE' && user.recoveryAnswerHash);
    const ok = verifyAnswer(answer, (usable && user!.recoveryAnswerHash) || DUMMY_ANSWER_HASH);
    if (!usable || !ok) {
      return NextResponse.json({ error: MISMATCH }, { status: 400 });
    }
    const token = await issuePasswordResetToken(user!.id, RECOVERY_TOKEN_TTL_MS);
    return NextResponse.json({ success: true, token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const dbDown = dbErrorResponse(err, 'recovery-verify');
    if (dbDown) return dbDown;
    throw err;
  }
}
export const dynamic = 'force-dynamic';
