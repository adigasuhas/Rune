import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const memberships = await db.teamMembership.findMany({ where: { userId: session.userId } });
  const teams = await Promise.all(
    memberships.map(async (m: any) => {
      const team = await db.team.findUnique({ where: { id: m.teamId } });
      if (!team) return null;
      const allMemberships = await db.teamMembership.findMany({ where: { teamId: team.id } });
      return { ...team, myRole: m.role, memberCount: allMemberships.length };
    })
  );

  return NextResponse.json(teams.filter(Boolean));
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a team name.' }, { status: 400 });
  }
  const { name } = parsed.data;

  try {
    // Creating a team is itself the Teams opt-in moment for the creator -
    // no separate flag to flip, this membership row is what "enables" it.
    const team = await db.team.create({ data: { name: name.trim(), ownerId: session.userId } });
    await db.teamMembership.create({ data: { teamId: team.id, userId: session.userId, role: 'OWNER' } });

    return NextResponse.json({ ...team, myRole: 'OWNER', memberCount: 1 });
  } catch (err) {
    console.error('Error creating team:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
