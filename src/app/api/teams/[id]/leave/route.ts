import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getMembership, removeMemberAndCleanup } from '@/lib/teams';

/** Self-service: leave a team you're not the owner of. Owners must transfer ownership or delete the team instead - same rule as account deletion. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const membership = await getMembership(id, session.userId);
    if (!membership) {
      return NextResponse.json({ error: 'You’re not a member of this team.' }, { status: 404 });
    }
    if (membership.role === 'OWNER') {
      return NextResponse.json({ error: 'The owner can’t leave the team. Transfer ownership or delete the team instead.' }, { status: 400 });
    }

    await removeMemberAndCleanup(id, session.userId, membership.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error leaving team:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
