import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { firstFocusWindow, isWorkingDate, toReviewEntry } from '@/lib/dailyReview';

/**
 * The first focus for today, if there is one to show: today (in the
 * user's zone) is a working day, an earlier review named its first focus
 * for exactly today, and it hasn't been acknowledged. `window` says when
 * it may show (an hour before work starts until work ends); the client
 * holds it back until then. Otherwise `{ focus: null }`.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const userId = session.userId;

  const [user, setting] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.setting.findUnique({ where: { userId } }),
  ]);
  const tz = user?.timezone || 'UTC';
  const today = getCurrentDateInTimezone(tz);
  const none = NextResponse.json({ focus: null });

  if (!isWorkingDate(today, setting?.workingDays)) return none;

  const review = await db.accomplishmentRecord.findFirst({
    where: { userId, firstFocusDate: today, date: { lt: today }, reviewedAt: { not: null }, firstFocus: { not: null } },
    orderBy: { date: 'desc' },
  });
  if (!review || !review.firstFocus?.trim()) return none;

  const ack = await db.firstFocusAck.findUnique({ where: { userId_focusDate: { userId, focusDate: today } } });
  if (ack) return none;

  const window = firstFocusWindow(today, setting?.workStart, setting?.workEnd, tz);
  if (Date.now() >= window.endsAt.getTime()) return none;

  return NextResponse.json({
    focus: toReviewEntry(review),
    today,
    workStart: setting?.workStart || '08:00',
    window: { startsAt: window.startsAt.toISOString(), endsAt: window.endsAt.toISOString() },
  });
}

export const dynamic = 'force-dynamic';
