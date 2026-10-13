/**
 * Single source of truth for "is this caller an administrator".
 *
 * An account is an admin when ANY of:
 *   - its `role` column is `DEVELOPER` (the built-in developer account from
 *     src/lib/devAccount.ts always has this, and an existing admin can grant
 *     it to any other account from the Developer console), or
 *   - its email is listed in `RUNE_ADMIN_EMAILS` (comma-separated).
 */
import { getSessionUser } from './auth';
import { db } from './db';
import { adminEmailAllowlist } from './authConfig';

export function isAdminEmail(email: string): boolean {
  return adminEmailAllowlist().has(email.trim().toLowerCase());
}

export interface AdminContext {
  userId: string;
  email: string;
  name: string | null;
}

/**
 * Resolves the current caller and asserts admin rights.
 * Returns `{ error, status }` on failure so a route can do:
 *   const admin = await requireAdmin();
 *   if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
 */
export async function requireAdmin(): Promise<AdminContext | { error: string; status: number }> {
  const session = await getSessionUser();
  if (!session) return { error: 'Sign in to continue.', status: 401 };

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.deletedAt) return { error: 'Sign in to continue.', status: 401 };
  if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
    return { error: 'This account is suspended or disabled.', status: 403 };
  }

  const admin = user.role === 'DEVELOPER' || isAdminEmail(user.email);
  if (!admin) return { error: 'Administrator access required.', status: 403 };

  return { userId: user.id, email: user.email, name: user.name ?? null };
}

/** Non-throwing convenience for UI-shaping (`me` route) - never gates data access on its own. */
export async function isAdminUser(user: { email: string; role?: string | null }): Promise<boolean> {
  return user.role === 'DEVELOPER' || isAdminEmail(user.email);
}
