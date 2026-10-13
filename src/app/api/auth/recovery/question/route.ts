import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';
import { decoyQuestionFor, getRecoveryQuestion } from '@/lib/recovery';
import { dbErrorResponse } from '@/lib/dbErrors';

const schema = z.object({ email: z.string().trim().toLowerCase().min(1).max(300) });

/**
 * Step 1 of secret-question recovery: which question to ask for this email.
 *
 * Every well-formed request gets a question back. An address with no account
 * (or an account with no question set) gets a decoy derived from the address
 * itself, stable across requests, so this can't be used to discover which
 * emails are registered. Only the question's id and text ever leave the
 * server - never anything about the answer.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'auth-recovery-question', 20, 15 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the email address you signed up with.' }, { status: 400 });
  }
  const { email } = parsed.data;

  let user;
  try {
    user = await db.user.findUnique({ where: { email } });
  } catch (err) {
    const dbDown = dbErrorResponse(err, 'recovery-question');
    if (dbDown) return dbDown;
    throw err;
  }

  const usable = user && !user.deletedAt && user.status === 'ACTIVE' && user.recoveryAnswerHash;
  const question = (usable && getRecoveryQuestion(user!.recoveryQuestion)) || decoyQuestionFor(email);

  return NextResponse.json(
    { question: { id: question.id, text: question.text } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
export const dynamic = 'force-dynamic';
