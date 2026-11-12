import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The caller's order for the project tabs on the Wall (project ids, first to last). */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const setting = await db.setting.findUnique({ where: { userId: session.userId }, select: { wallProjectOrder: true } });
  return NextResponse.json({ projectIds: setting?.wallProjectOrder ?? [] });
}

const orderSchema = z.object({ projectIds: z.array(z.string().min(1).max(100)).max(1000) }).strict();

export async function PUT(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const parsed = orderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send the projects in their new order.' }, { status: 400 });
  const projectIds = Array.from(new Set(parsed.data.projectIds));
  await db.setting.upsert({
    where: { userId: session.userId },
    update: { wallProjectOrder: projectIds },
    create: { userId: session.userId, wallProjectOrder: projectIds },
  });
  return NextResponse.json({ projectIds });
}
