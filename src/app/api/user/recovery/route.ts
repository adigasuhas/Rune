import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getRecoveryQuestion, hashAnswer, validateAnswer } from '@/lib/recovery';

/** Which recovery question this account uses (id only - the answer never leaves the server). */
export async function GET() {
  const session = await getSessionUser();
  if (!session || session.viaApiToken) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  return NextResponse.json({
    questionId: user.recoveryAnswerHash ? getRecoveryQuestion(user.recoveryQuestion)?.id ?? null : null,
  });
}

const schema = z.object({
  currentPassword: z.string().max(300).optional(),
  questionId: z.string().max(64),
  answer: z.string().max(300),
});

/**
 * Set or change the recovery question. Requires the current password when
 * the account has one - otherwise a borrowed, already-open session could
 * quietly install its own way back in.
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  if (!session || session.viaApiToken) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const limited = enforceRateLimit(req, 'set-recovery', 5, 5 * 60_000, session.userId);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a question and enter an answer.' }, { status: 400 });
  const { currentPassword, questionId, answer } = parsed.data;

  if (!getRecoveryQuestion(questionId)) return NextResponse.json({ error: 'Choose a recovery question.' }, { status: 400 });
  const answerError = validateAnswer(answer, session.email);
  if (answerError) return NextResponse.json({ error: answerError }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  if (user.passwordHash && (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 403 });
  }

  await db.user.update({
    where: { id: user.id },
    data: { recoveryQuestion: questionId, recoveryAnswerHash: hashAnswer(answer) },
  });
  return NextResponse.json({ success: true, questionId });
}
export const dynamic = 'force-dynamic';
