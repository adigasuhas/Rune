import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/teams';

const transferSchema = z.object({ newOwnerId: z.string().min(1).max(200) });

/** Hands ownership to another existing team member; the previous owner becomes a Team Leader rather than losing access outright. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const callerMembership = await getMembership(id, session.userId);
    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only the current owner can transfer ownership.' }, { status: 403 });
    }

    const parsed = transferSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'newOwnerId is required.' }, { status: 400 });
    }
    const { newOwnerId } = parsed.data;
    if (newOwnerId === session.userId) {
      return NextResponse.json({ error: 'You’re already the owner.' }, { status: 400 });
    }

    const newOwnerMembership = await getMembership(id, newOwnerId);
    if (!newOwnerMembership) {
      return NextResponse.json({ error: 'newOwnerId must already be a member of this team.' }, { status: 400 });
    }

    await db.teamMembership.update({ where: { id: newOwnerMembership.id }, data: { role: 'OWNER' } });
    await db.teamMembership.update({ where: { id: callerMembership.id }, data: { role: 'TEAM_LEADER' } });
    await db.team.update({ where: { id }, data: { ownerId: newOwnerId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error transferring team ownership:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
