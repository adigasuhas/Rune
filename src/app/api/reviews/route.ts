import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseDateInTimezone } from '@/lib/dateUtils';
import { computeDaySnapshot } from '@/lib/accomplishmentSnapshot';
import { isDateKey, nextWorkingDay, toReviewEntry } from '@/lib/dailyReview';

/**
 * Review the Day, kept. One review per user per day - it lives on that
 * day's AccomplishmentRecord, so saving again updates it in place.
 *
 * GET ?date=YYYY-MM-DD      that day's review (or null) - prefills the form
 * GET ?before=&limit=       newest first, for the history in Analytics
 * POST                      save (create or update) a review
 */

const text = z.string().max(10_000).nullable().optional();
const saveSchema = z.object({
  date: z.string().refine(isDateKey),
  wentWell: text,
  firstFocus: text,
  /** Only an explicit yes turns the first focus into a task. */
  addFirstFocusAsTask: z.boolean().optional(),
});

const answered = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  const t = (v ?? '').trim();
  return t ? t : null;
};

const REVIEWED = { reviewedAt: { not: null } };

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const userId = session.userId;
  const url = new URL(req.url);

  const date = url.searchParams.get('date');
  if (date !== null) {
    if (!isDateKey(date)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 });
    const r = await db.accomplishmentRecord.findUnique({ where: { userId_date: { userId, date } } });
    return NextResponse.json({ review: r && r.reviewedAt ? toReviewEntry(r) : null });
  }

  const before = url.searchParams.get('before');
  if (before !== null && !isDateKey(before)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 });
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));

  const rows = await db.accomplishmentRecord.findMany({
    where: { userId, ...REVIEWED, ...(before ? { date: { lt: before } } : {}) },
    orderBy: { date: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const focusDates = page.map((r: any) => r.firstFocusDate).filter(Boolean);
  const acks = focusDates.length
    ? await db.firstFocusAck.findMany({ where: { userId, focusDate: { in: focusDates } } })
    : [];
  const ackFor = new Map<string, any>(acks.map((a: any) => [`${a.focusDate}|${a.reviewDate}`, a.acknowledgedAt]));

  const [total, withFocus, first] = await Promise.all([
    db.accomplishmentRecord.count({ where: { userId, ...REVIEWED } }),
    db.accomplishmentRecord.count({ where: { userId, ...REVIEWED, firstFocus: { not: null } } }),
    db.accomplishmentRecord.findFirst({ where: { userId, ...REVIEWED }, orderBy: { date: 'asc' } }),
  ]);

  return NextResponse.json({
    reviews: page.map((r: any) => toReviewEntry(r, r.firstFocusDate ? ackFor.get(`${r.firstFocusDate}|${r.date}`) ?? null : null)),
    nextBefore: rows.length > limit ? page[page.length - 1].date : null,
    summary: { total, withFocus, since: first?.date ?? null },
  });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const userId = session.userId;

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 });
  const { date, addFirstFocusAsTask } = parsed.data;

  try {
    const [user, setting, existing] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.setting.findUnique({ where: { userId } }),
      db.accomplishmentRecord.findUnique({ where: { userId_date: { userId, date } } }),
    ]);
    const tz = user?.timezone || 'UTC';

    // Fields left out of the request keep what was saved before.
    const wentWell = answered(parsed.data.wentWell) ?? (parsed.data.wentWell === undefined ? existing?.wentWell ?? null : null);
    const firstFocus = answered(parsed.data.firstFocus) ?? (parsed.data.firstFocus === undefined ? existing?.firstFocus ?? null : null);
    const firstFocusDate = firstFocus ? nextWorkingDay(date, setting?.workingDays) : null;

    const snapshot = await computeDaySnapshot(userId, date, tz);
    const completed = (JSON.parse(snapshot.completedTasks) as unknown[]).length;
    // keyAchievements predates the review fields and is still read as the
    // day's one-line summary, so it keeps its old fallback when "went well"
    // is blank. The answer itself lives, verbatim, in wentWell.
    const keyAchievements = wentWell
      || (completed > 0 ? `Completed ${completed} task${completed === 1 ? '' : 's'}.` : 'Reviewed the day.');

    // A task only on an explicit request, and only once per review: a
    // second save with the box still ticked must not add a duplicate.
    let firstFocusTaskId: string | null = existing?.firstFocusTaskId ?? null;
    if (firstFocusTaskId && !(await db.task.findUnique({ where: { id: firstFocusTaskId } }))) firstFocusTaskId = null;
    let taskCreated = false;
    if (addFirstFocusAsTask && firstFocus && firstFocusDate && !firstFocusTaskId) {
      const name = firstFocus.split('\n')[0].trim().slice(0, 500);
      const task = await db.task.create({
        data: {
          name,
          detail: firstFocus === name ? '' : firstFocus,
          priority: 'HIGH',
          sessionType: 'DEEP_WORK',
          date: parseDateInTimezone(firstFocusDate, tz),
          status: 'PENDING',
          userId,
        },
      });
      firstFocusTaskId = task.id;
      taskCreated = true;
    }

    const review = {
      reviewedAt: existing?.reviewedAt ?? new Date(),
      wentWell,
      firstFocus,
      firstFocusDate,
      firstFocusTaskId,
    };
    const record = await db.accomplishmentRecord.upsert({
      where: { userId_date: { userId, date } },
      update: { ...snapshot, keyAchievements, ...review },
      create: { userId, date, ...snapshot, keyAchievements, ...review },
    });

    return NextResponse.json({ review: toReviewEntry(record), taskCreated, updated: !!existing?.reviewedAt });
  } catch (err) {
    console.error('Error saving daily review:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
