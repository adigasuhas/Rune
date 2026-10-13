/**
 * Self-service "forgot password" tokens. Only the SHA-256 of the token is
 * stored (same pattern as ApiToken.tokenHash) - the plaintext exists only in
 * the emailed/console-logged reset link, briefly, and is never persisted.
 */
import crypto from 'node:crypto';
import { db } from './db';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Issues a new reset token for this user, replacing any previous one. Returns the raw (unhashed) token. */
export async function issuePasswordResetToken(userId: string, ttlMs: number = RESET_TOKEN_TTL_MS): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.user.update({
    where: { id: userId },
    data: {
      passwordResetTokenHash: hashResetToken(token),
      passwordResetTokenExpiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

/** Resolves a raw reset token to the user id it belongs to, or null if it's missing, unknown, or expired. */
export async function resolvePasswordResetToken(token: string): Promise<string | null> {
  if (!token) return null;
  const hash = hashResetToken(token);
  const user = await db.user.findUnique({ where: { passwordResetTokenHash: hash } });
  if (!user) return null;
  if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt.getTime() < Date.now()) return null;
  return user.id;
}
