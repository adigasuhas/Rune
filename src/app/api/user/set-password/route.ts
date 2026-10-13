import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, invalidateSessionCache, setSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/authConfig';

const setPasswordSchema = z.object({
  currentPassword: z.string().max(300).optional(),
  newPassword: z.string().max(300),
});

/**
 * Lets an already-authenticated user set or change their password. If a
 * password is already set, the current one must be confirmed first; if this
 * is the first time (a legacy account with none), the active session is
 * proof enough.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  // Tight limit - this is a security-sensitive write (and, unlike a login
  // attempt, always comes from an already-authenticated session), not
  // something a real user ever does in rapid succession.
  const limited = enforceRateLimit(req, 'set-password', 5, 5 * 60_000, session.userId);
  if (limited) return limited;

  const parsed = setPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a new password.' }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;
  const passwordError = validatePassword(newPassword, session.email);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  if (user.passwordHash) {
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 403 });
    }
  }

  // A new password signs out every other browser (a changed password is
  // usually a response to a lost device or a leak) - the same as a reset.
  // This browser gets a fresh cookie for the new version so it stays in.
  const sessionVersion = (user.sessionVersion ?? 0) + 1;
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), sessionVersion }
  });
  invalidateSessionCache(user.id);
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name || undefined, sv: sessionVersion });

  return NextResponse.json({ success: true, hasPassword: true });
}
export const dynamic = 'force-dynamic';
