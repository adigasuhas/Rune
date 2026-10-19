import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isDateKey } from '@/lib/dailyReview';

/**
 * "Seen it" for one working day's first focus. Idempotent (one row per
 * user per day; a repeat keeps the first time), and refused when that day
 * has no first focus, so opening Today never marks anything by itself.
 * Writes only FirstFocusAck - the review and any task are left alone.
 */
const schema = z.object({ focusDate: z.string().refine(isDateKey) });

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const userId = session.userId;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 });
  const { focusDate } = parsed.data;

  const review = await db.accomplishmentRecord.findFirst({
    where: { userId, firstFocusDate: focusDate, date: { lt: focusDate }, reviewedAt: { not: null }, firstFocus: { not: null } },
    orderBy: { date: 'desc' },
  });
  if (!review || !review.firstFocus?.trim()) {
    return NextResponse.json({ error: 'There’s no first focus for that day.' }, { status: 404 });
  }

  const ack = await db.firstFocusAck.upsert({
    where: { userId_focusDate: { userId, focusDate } },
    update: {},
    create: { userId, focusDate, reviewDate: review.date },
  });
  return NextResponse.json({ focusDate: ack.focusDate, acknowledgedAt: new Date(ack.acknowledgedAt).toISOString() });
}

export const dynamic = 'force-dynamic';
