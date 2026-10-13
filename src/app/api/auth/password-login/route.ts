import { NextRequest, NextResponse } from 'next/server';
import { isDefaultDeveloperLogin } from '@/lib/devAccount';
import { z } from 'zod';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { verifyPassword, needsRehash, hashPassword } from '@/lib/crypto';
import { dbErrorResponse } from '@/lib/dbErrors';

// Verified against when the email doesn't exist, so "no such account" costs
// the same PBKDF2 time as "wrong password" and response timing can't be
// used to discover which addresses are registered.
const DUMMY_HASH = hashPassword('rune-timing-equaliser-not-a-real-password');

const loginSchema = z.object({
  email: z.string().min(1).max(300),
  password: z.string().min(1).max(300),
});

/**
 * The one sign-in path - every account has a password (created via
 * /api/auth/signup, by an administrator, or set later in Settings), so this
 * route works the same in every environment.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'auth-password-login', 20, 5 * 60_000);
  if (limited) return limited;

  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const normalizedEmail = email.trim().toLowerCase();

  // Per-account limit on top of the per-client one: stops a distributed
  // guessing run against a single address.
  const perAccount = enforceRateLimit(req, 'auth-password-login-email', 8, 15 * 60_000, normalizedEmail);
  if (perAccount) return perAccount;

  let user;
  try {
    user = await db.user.findUnique({ where: { email: normalizedEmail } });
  } catch (err) {
    const dbDown = dbErrorResponse(err, 'password-login');
    if (dbDown) return dbDown;
    throw err;
  }

  // Same error for "no such user", "no password set" and "wrong password" -
  // don't leak which emails have an account.
  const passwordOk = verifyPassword(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.passwordHash || !passwordOk) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }
  if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
    return NextResponse.json({ error: 'This account is suspended or disabled.' }, { status: 403 });
  }
  // The built-in admin's default password is published in the source, so a
  // production server never accepts it, even on a database where the
  // account was created with it before this check existed.
  if (process.env.NODE_ENV === 'production' && isDefaultDeveloperLogin(normalizedEmail, password)) {
    return NextResponse.json(
      { error: 'This built-in account still has its public default password, so it can’t sign in. Use “Forgot password?” to set a new one.' },
      { status: 403 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
      // Lazily re-hash under the current iteration count if this password
      // was set before a later hardening bump - same pattern crypto.ts was
      // built for.
      ...(needsRehash(user.passwordHash) ? { passwordHash: hashPassword(password) } : {})
    }
  });
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name || undefined, sv: user.sessionVersion ?? 0 });

  return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
}
export const dynamic = 'force-dynamic';
