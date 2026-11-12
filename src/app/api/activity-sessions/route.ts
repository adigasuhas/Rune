import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseDateInTimezone } from '@/lib/dateUtils';
import { findOverlap, overlapMessage, MAX_SESSION_MS } from '@/lib/activityTime';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/**
 * The caller's breaks and brain drain. `from`/`to` (YYYY-MM-DD, inclusive,
 * in their time zone) narrow it to sessions that started in that range;
 * the running session, if any, is always included. `?running=1` returns
 * only the running one.
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (url.searchParams.get('running') === '1') {
    return NextResponse.json(
      await db.activitySession.findMany({ where: { userId: session.userId, end: null }, select: { id: true, kind: true, start: true, end: true } })
    );
  }
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
  const tz = user?.timezone || 'UTC';
  const range: { gte?: Date; lt?: Date } = {};
  if (from && ymd.test(from)) range.gte = parseDateInTimezone(from, tz);
  if (to && ymd.test(to)) range.lt = new Date(parseDateInTimezone(to, tz).getTime() + DAY);
  const sessions = await db.activitySession.findMany({
    where: { userId: session.userId, ...(range.gte || range.lt ? { OR: [{ start: range }, { end: null }] } : {}) },
    orderBy: { start: 'asc' },
    select: { id: true, kind: true, start: true, end: true },
  });
  return NextResponse.json(sessions);
}

const startSchema = z.object({ action: z.literal('start'), kind: z.enum(['BREAK', 'BRAIN_DRAIN']) }).strict();
const manualSchema = z
  .object({ kind: z.enum(['BREAK', 'BRAIN_DRAIN']), start: z.string().datetime(), end: z.string().datetime() })
  .strict();

/**
 * Start a break or brain drain now (`{action: "start", kind}`) - whatever
 * was running stops at this moment, so two never overlap - or record one
 * after the fact (`{kind, start, end}`).
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const userId = session.userId;
  const now = new Date();

  const start = startSchema.safeParse(body);
  if (start.success) {
    const created = await db.$transaction(async (tx) => {
      await tx.activitySession.updateMany({ where: { userId, end: null, start: { lte: now } }, data: { end: now } });
      return tx.activitySession.create({
        data: { userId, kind: start.data.kind, start: now },
        select: { id: true, kind: true, start: true, end: true },
      });
    });
    return NextResponse.json(created, { status: 201 });
  }

  const manual = manualSchema.safeParse(body);
  if (!manual.success) return NextResponse.json({ error: 'Choose break or brain drain, with a start and an end.' }, { status: 400 });
  const s = new Date(manual.data.start);
  const e = new Date(manual.data.end);
  if (e <= s) return NextResponse.json({ error: 'The end has to be after the start.' }, { status: 400 });
  if (e.getTime() - s.getTime() > MAX_SESSION_MS) return NextResponse.json({ error: 'One entry can be at most 12 hours.' }, { status: 400 });
  if (e.getTime() > now.getTime() + 60_000) return NextResponse.json({ error: 'That ends in the future. Record it once it’s over, or start it now.' }, { status: 400 });

  const existing = await db.activitySession.findMany({
    where: { userId, start: { lt: e }, OR: [{ end: null }, { end: { gt: s } }] },
    select: { id: true, kind: true, start: true, end: true },
  });
  const clash = findOverlap(s, e, existing, now);
  if (clash) return NextResponse.json({ error: overlapMessage(clash) }, { status: 409 });

  const created = await db.activitySession.create({
    data: { userId, kind: manual.data.kind, start: s, end: e },
    select: { id: true, kind: true, start: true, end: true },
  });
  return NextResponse.json(created, { status: 201 });
}
