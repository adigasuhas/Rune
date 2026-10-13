import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isAdminUser } from '@/lib/admin';

/** True when the request carries a session cookie or an Authorization header. */
async function sentCredentials(): Promise<boolean> {
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    return Boolean(cookieStore.get('rune-session')?.value || headerList.get('authorization'));
  } catch {
    return false; // outside a request scope (unit tests)
  }
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    // "Who am I?" from a visitor who never signed in is a normal question,
    // not an error: answer 200 so public pages don't log a failed request.
    // Credentials that were sent but are bad or expired still get 401, which
    // API-token clients (the MCP server) rely on.
    if (!(await sentCredentials())) {
      return NextResponse.json({ authenticated: false, user: null });
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  
  const user = await db.user.findUnique({
    where: { id: session.userId }
  });
  
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
    return NextResponse.json({ authenticated: false, error: 'This account is suspended or disabled.' }, { status: 403 });
  }
  
  const isDev = await isAdminUser(user);

  // Whether Teams is enabled for this user (they own or belong to a team) -
  // drives whether team-only surfaces like the Lab overview show in the nav.
  const teamMemberships = await db.teamMembership.findMany({ where: { userId: user.id } });
  const hasTeam = teamMemberships.length > 0;

  let showCreateFirstUser = false;
  if (isDev) {
    const allUsers = await db.user.findMany();
    const otherUsers = allUsers.filter(u => u.role !== 'DEVELOPER' && !u.deletedAt);
    showCreateFirstUser = otherUsers.length === 0;
  }

  // Explicit allow-list - never ship internal columns (passwordHash,
  // analyticsStartDate, raw timestamps) to the browser.
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      theme: user.theme,
      isOnboarded: user.isOnboarded,
      role: user.role,
      isDeveloper: isDev,
      showCreateFirstUser,
      hasTeam,
      hasPassword: !!user.passwordHash,
      hasRecovery: !!user.recoveryAnswerHash,
    },
  });
}
export const dynamic = 'force-dynamic';
