/**
 * The built-in developer/admin account. Rune no longer has a separate
 * "developer login" surface - the developer account signs in through the
 * exact same email + password form everyone else uses. What makes it a
 * developer is a database row with `role: 'DEVELOPER'`, created once, here,
 * the first time the server boots against a fresh database.
 *
 * The default password below is public (it's in this file), so it is for
 * local development only:
 * - In production the account is created only when RUNE_DEVELOPER_PASSWORD
 *   is set to a strong password. Otherwise no built-in admin exists; make
 *   one with RUNE_ADMIN_EMAILS or `npm run create-user`.
 * - A production database that already has the account with the default
 *   password can't be signed into with it (password-login refuses it) until
 *   an operator sets a real one.
 */
import { db } from './db';
import { hashPassword, verifyPassword } from './crypto';
import { validatePassword } from './authConfig';

export const DEVELOPER_EMAIL = 'developer_adiga@rune.io';
export const DEFAULT_DEVELOPER_PASSWORD = 'developer12345';

const isProduction = () => process.env.NODE_ENV === 'production';

/** The public default credential, which production never accepts. */
export function isDefaultDeveloperLogin(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEVELOPER_EMAIL && password === DEFAULT_DEVELOPER_PASSWORD;
}

/** The password to provision the account with, or null to not create it. */
export function developerPasswordForCreation(): string | null {
  const configured = process.env.RUNE_DEVELOPER_PASSWORD;
  if (!isProduction()) return configured || DEFAULT_DEVELOPER_PASSWORD;
  if (!configured) return null;
  if (configured === DEFAULT_DEVELOPER_PASSWORD || validatePassword(configured, DEVELOPER_EMAIL)) return null;
  return configured;
}

/**
 * Idempotent: does nothing once the account exists, so an operator's later
 * password change (or a password reset) is never overwritten on restart.
 * Never throws - a transient database hiccup at boot shouldn't crash the
 * server; it just retries on the next restart.
 */
export async function ensureDeveloperAccount(): Promise<void> {
  try {
    const existing = await db.user.findUnique({ where: { email: DEVELOPER_EMAIL } });
    if (existing) {
      if (isProduction() && existing.passwordHash && verifyPassword(DEFAULT_DEVELOPER_PASSWORD, existing.passwordHash)) {
        console.error(
          `[devAccount] ${DEVELOPER_EMAIL} still has the public default password. Sign-in with it is refused in production. ` +
            'Set a new one: "Forgot password?" on the sign-in page (the link is written to this log when SMTP is off), or `npm run reset-password`.'
        );
      }
      return;
    }

    const password = developerPasswordForCreation();
    if (!password) {
      if (process.env.RUNE_DEVELOPER_PASSWORD) {
        console.error('[devAccount] RUNE_DEVELOPER_PASSWORD is too weak (or is the public default), so the built-in developer account was not created. Use 10+ characters that aren\'t a common password.');
      } else {
        console.log('[devAccount] No built-in developer account in production. Set RUNE_DEVELOPER_PASSWORD to create it, or name admins in RUNE_ADMIN_EMAILS.');
      }
      return;
    }
    await db.user.create({
      data: {
        email: DEVELOPER_EMAIL,
        name: 'Developer',
        passwordHash: hashPassword(password),
        role: 'DEVELOPER',
        isOnboarded: true,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(DEVELOPER_EMAIL)}`,
      },
    });
    console.log(`[devAccount] Created the built-in developer account (${DEVELOPER_EMAIL}). Change its password after first sign-in.`);
  } catch (err) {
    // A unique-constraint error here means another server instance/replica
    // created it first between our findUnique and create - not a failure.
    if ((err as { code?: string })?.code === 'P2002') return;
    console.error('[devAccount] Could not ensure the developer account exists:', err);
  }
}
