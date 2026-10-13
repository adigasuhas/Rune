import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentDateInTimezone, isoWeekKey } from '@/lib/dateUtils';
import { computeWeeklyDigest, digestNotificationBody } from '@/lib/digest';
import { createNotification } from '@/lib/notify';

/**
 * Returns the caller's current weekly digest, and - the first time it's
 * requested in a new calendar week - drops a WEEKLY_DIGEST notification on
 * their bell. Idempotent per (user, ISO week) via the dedupe key, so the
 * client can safely call this on every load. The client calls it; there is
 * no cron.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  const tz = user?.timezone || 'UTC';
  const weekKey = isoWeekKey(getCurrentDateInTimezone(tz), tz);
  const dedupeKey = `digest:weekly:${weekKey}`;

  const digest = await computeWeeklyDigest(session.userId);

  // Has this week's digest notification already been created?
  const existing = await db.notification.findMany({
    where: { userId: session.userId, dedupeKey }
  });

  if (existing.length === 0) {
    await createNotification({
      userId: session.userId,
      type: 'WEEKLY_DIGEST',
      title: 'Your week ahead',
      body: digestNotificationBody(digest),
      sourceType: 'Digest',
      sourceId: null,
      dedupeKey
    });
  }

  return NextResponse.json({ ...digest, weekKey, alreadyNotified: existing.length > 0 });
}

export const dynamic = 'force-dynamic';
