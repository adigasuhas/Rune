import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateInviteCode, getMembership, isOwnerOrLeader } from '@/lib/teams';

const createSchema = z.object({
  role: z.string().max(50).optional(),
  expiresInDays: z.union([z.string(), z.number()]).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const membership = await getMembership(id, session.userId);
  if (!membership || !isOwnerOrLeader(membership.role)) {
    return NextResponse.json({ error: 'Only the owner or a team leader can view invites.' }, { status: 403 });
  }

  const invites = await db.teamInvite.findMany({ where: { teamId: id } });
  return NextResponse.json(invites);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const membership = await getMembership(id, session.userId);
    if (!membership || !isOwnerOrLeader(membership.role)) {
      return NextResponse.json({ error: 'Only the owner or a team leader can create invites.' }, { status: 403 });
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { role, expiresInDays } = parsed.data;
    // Team Leaders can only invite Members - granting Team Leader role is
    // Owner-only, to avoid a Team Leader escalating anyone (including
    // themselves indirectly) into a peer leadership role via invite.
    let grantedRole: 'TEAM_LEADER' | 'MEMBER' = 'MEMBER';
    if (role === 'TEAM_LEADER') {
      if (membership.role !== 'OWNER') {
        return NextResponse.json({ error: 'Only the owner can create team leader invites.' }, { status: 403 });
      }
      grantedRole = 'TEAM_LEADER';
    }

    const invite = await db.teamInvite.create({
      data: {
        teamId: id,
        code: generateInviteCode(),
        role: grantedRole,
        createdById: session.userId,
        expiresAt: expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000) : null
      }
    });

    return NextResponse.json(invite);
  } catch (err) {
    console.error('Error creating team invite:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
