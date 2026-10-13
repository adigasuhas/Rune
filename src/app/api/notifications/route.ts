import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isNotificationTypeEnabled } from '@/lib/notify';
import { enforceRateLimit } from '@/lib/rateLimit';

const createSchema = z.object({
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().max(5000).nullable().optional(),
  sourceType: z.string().min(1).max(100),
  sourceId: z.string().max(200).nullable().optional(),
  dedupeKey: z.string().max(300).nullable().optional(),
});

const INBOX_PAGE_SIZE = 50;

/**
 * Default (no params): the bell's active-only list, exactly as before.
 * `?all=true`: the full inbox page's history view, including dismissed
 * notifications, newest first, paginated via `?skip=N`.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const limited = enforceRateLimit(req, 'notify-read', 60, 60_000, session.userId);
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const includeDismissed = searchParams.get('all') === 'true';
  const skip = Math.max(0, Number(searchParams.get('skip')) || 0);

  const notifications = await db.notification.findMany({
    where: { userId: session.userId, ...(includeDismissed ? {} : { dismissedAt: null }) },
    ...(includeDismissed ? { orderBy: { createdAt: 'desc' as const }, take: INBOX_PAGE_SIZE, skip } : {})
  });
  return NextResponse.json(notifications);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  // Generous - the client-side scans that call this poll at 60s intervals
  // per reminder type; this just bounds abuse, not normal use.
  const limited = enforceRateLimit(req, 'notify-create', 60, 60_000, session.userId);
  if (limited) return limited;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { type, title, body, sourceType, sourceId, dedupeKey } = parsed.data;

  try {
    if (!(await isNotificationTypeEnabled(session.userId, type))) {
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    const notification = await db.notification.create({
      data: {
        userId: session.userId,
        type,
        title,
        body: body || null,
        sourceType,
        sourceId: sourceId || null,
        dedupeKey: dedupeKey || null
      }
    });

    const { _wasExisting, ...rest } = notification;
    return NextResponse.json(rest, { status: _wasExisting ? 200 : 201 });
  } catch (err) {
    console.error('Error creating notification:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

/** Mark every one of the caller's active notifications as read + dismissed in one call. */
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const limited = enforceRateLimit(req, 'notify-mark-all', 10, 60_000, session.userId);
  if (limited) return limited;

  await db.notification.updateMany({
    where: { userId: session.userId, dismissedAt: null },
    data: { read: true, dismissedAt: new Date() }
  });

  return NextResponse.json({ success: true });
}
export const dynamic = 'force-dynamic';
