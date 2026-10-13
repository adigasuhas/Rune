import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';
import { hashPassword } from '@/lib/crypto';
import { validatePassword } from '@/lib/authConfig';
import { resolvePasswordResetToken } from '@/lib/passwordReset';
import { invalidateSessionCache } from '@/lib/auth';

const schema = z.object({
  token: z.string().min(1).max(500),
  newPassword: z.string().min(1).max(300),
});

/** Completes a self-service password reset. Only ever changes passwordHash - never role/status, so this can't be used to obtain admin rights. */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'auth-reset-password', 10, 15 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Something is missing. Try the reset link again.' }, { status: 400 });
  }
  const { token, newPassword } = parsed.data;

  const userId = await resolvePasswordResetToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Start again from “Forgot password”.' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Start again from “Forgot password”.' }, { status: 400 });
  }

  const passwordError = validatePassword(newPassword, user.email);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      // Signs out every existing session (including whoever might have been
      // using the old password) - the same "sign out everywhere" mechanism
      // used for suspend/disable.
      sessionVersion: (user.sessionVersion ?? 0) + 1,
    },
  });
  invalidateSessionCache(user.id);

  return NextResponse.json({ success: true });
}
export const dynamic = 'force-dynamic';
