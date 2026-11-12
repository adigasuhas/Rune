import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { findOverlap, overlapMessage, MAX_SESSION_MS } from '@/lib/activityTime';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    stop: z.literal(true).optional(),
    kind: z.enum(['BREAK', 'BRAIN_DRAIN']).optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  })
  .strict();

/** Stop a running session (`{stop: true}`), or correct its kind or times. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const current = await db.activitySession.findFirst({ where: { id, userId: session.userId } });
  if (!current) return NextResponse.json({ error: 'That entry no longer exists.' }, { status: 404 });

  const now = new Date();
  const start = parsed.data.start ? new Date(parsed.data.start) : current.start;
  let end: Date | null = parsed.data.end ? new Date(parsed.data.end) : current.end;
  if (parsed.data.stop && !current.end) end = now < start ? start : now;

  if (end && end <= start) return NextResponse.json({ error: 'The end has to be after the start.' }, { status: 400 });
  if (start.getTime() > now.getTime() + 60_000) return NextResponse.json({ error: 'That starts in the future.' }, { status: 400 });
  if (end && end.getTime() > now.getTime() + 60_000) return NextResponse.json({ error: 'That ends in the future.' }, { status: 400 });
  if (end && end.getTime() - start.getTime() > MAX_SESSION_MS) return NextResponse.json({ error: 'One entry can be at most 12 hours.' }, { status: 400 });

  const others = await db.activitySession.findMany({
    where: { userId: session.userId, id: { not: id } },
    select: { id: true, kind: true, start: true, end: true },
  });
  const clash = findOverlap(start, end ?? now, others, now);
  if (clash) return NextResponse.json({ error: overlapMessage(clash) }, { status: 409 });

  const updated = await db.activitySession.update({
    where: { id },
    data: { start, end, ...(parsed.data.kind ? { kind: parsed.data.kind } : {}) },
    select: { id: true, kind: true, start: true, end: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { id } = await params;
  const { count } = await db.activitySession.deleteMany({ where: { id, userId: session.userId } });
  if (count === 0) return NextResponse.json({ error: 'That entry no longer exists.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
