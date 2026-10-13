import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';
import { enforceRateLimit } from '@/lib/rateLimit';

// Redeeming an invite is deliberately the Teams opt-in moment (see
// docs/Plan_overhaul.md Phase 7) - there's no separate "enable Teams"
// step anywhere else. This is the only place a TeamMembership row gets
// created for someone other than a team's own creator.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  // Invite codes are short; throttle redemption attempts to stop enumeration.
  const limited = enforceRateLimit(req, 'invite-redeem', 10, 10 * 60_000, session.userId);
  if (limited) return limited;

  try {
    const { code } = await params;
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
      return NextResponse.json({ error: 'This invite link isn’t valid or has expired.' }, { status: 404 });
    }
    const invite = await db.teamInvite.findUnique({ where: { code } });
    if (!invite || invite.revoked || (invite.expiresAt && new Date(invite.expiresAt) < new Date())) {
      return NextResponse.json({ error: 'This invite link isn’t valid or has expired.' }, { status: 404 });
    }

    const team = await db.team.findUnique({ where: { id: invite.teamId } });
    if (!team) {
      return NextResponse.json({ error: 'This invite link isn’t valid or has expired.' }, { status: 404 });
    }

    const existing = await getMembership(invite.teamId, session.userId);
    if (existing) {
      return NextResponse.json({ error: 'You’re already a member of this team.', teamId: team.id }, { status: 409 });
    }

    await db.teamMembership.create({
      data: { teamId: invite.teamId, userId: session.userId, role: invite.role }
    });

    return NextResponse.json({ success: true, teamId: team.id, teamName: team.name, role: invite.role });
  } catch (err) {
    console.error('Error redeeming team invite:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
