import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearSessionCookie, getSessionUser, invalidateSessionCache } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';

const deleteSchema = z.object({
  password: z.string().max(300).optional(),
  confirmEmail: z.string().max(254).optional(),
});

// Self-service account deletion. Distinct from the admin-only
// /api/developer/users DELETE and the CLI delete-user script - this is the
// "delete my own account" path a regular user reaches from Settings.
export async function DELETE(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  // Irreversible, so a session alone isn't enough: the server re-checks the
  // password (or, for an old account that never set one, the typed email).
  // A stolen session cookie can't delete the account.
  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  const confirm = parsed.success ? parsed.data : {};

  try {
    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    const confirmed = user.passwordHash
      ? typeof confirm.password === 'string' && verifyPassword(confirm.password, user.passwordHash)
      : confirm.confirmEmail?.trim().toLowerCase() === user.email.toLowerCase();
    if (!confirmed) {
      return NextResponse.json(
        { error: user.passwordHash ? 'Your password is incorrect.' : 'Type your email to confirm.' },
        { status: 403 }
      );
    }

    // Block deletion if this user is the sole owner of a team that still
    // has other members - deleting the account would otherwise cascade the
    // whole team away (see the team.delete/user.delete mocks in
    // src/lib/db.ts) and silently kick everyone else out. A solo-owned team
    // (no other members) is safe to take down along with the account.
    const ownedTeams = await db.team.findMany({ where: { ownerId: session.userId } });
    const blockingTeams: string[] = [];
    for (const team of ownedTeams) {
      const memberships = await db.teamMembership.findMany({ where: { teamId: team.id } });
      if (memberships.length > 1) {
        blockingTeams.push(team.name);
      }
    }
    if (blockingTeams.length > 0) {
      return NextResponse.json(
        {
          error: `You own ${blockingTeams.length === 1 ? 'a team' : 'teams'} with other members (${blockingTeams.join(', ')}). Transfer ownership or remove the other members before deleting your account.`
        },
        { status: 409 }
      );
    }

    await db.user.delete({ where: { id: session.userId } });
    // Other tabs holding this session must stop working now, not when the
    // 30-second active-account cache next expires.
    invalidateSessionCache(session.userId);
    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting account:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
