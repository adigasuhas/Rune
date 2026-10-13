import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NotificationType } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { convertWeekdaysToDates } from '@/lib/dateUtils';
import { buildSettingsDefaults, buildSettingsPayload } from '@/lib/settingsFields';

const NOTIFICATION_TYPES = new Set(Object.values(NotificationType) as string[]);

// Named profile fields, typed explicitly; every other key falls through to
// .catchall() and is validated against the SettingValue union - the same
// string|number|boolean type every entry in SETTINGS_FIELDS (settingsFields.ts,
// this route's own "single source of truth" for the dynamic field list) is
// declared as. This avoids hardcoding that field list a second time here.
const settingsSchema = z.object({
  name: z.string().max(200).optional(),
  timezone: z.string().max(100).optional(),
  theme: z.string().max(50).optional(),
  isOnboarded: z.boolean().optional(),
  workingDays: z.string().max(2_000_000).optional(),
  notificationPreferences: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.union([z.string().max(2_000_000), z.number(), z.boolean()]));

/** Keeps only recognized NotificationType keys mapped to a strict boolean - never trust the client's object shape as-is. */
function sanitizeNotificationPreferences(input: unknown): Record<string, boolean> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (NOTIFICATION_TYPES.has(key) && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const settings = await db.setting.findUnique({
    where: { userId: session.userId }
  });

  const user = await db.user.findUnique({
    where: { id: session.userId }
  });

  // analyticsStartDate is the working-days/analytics epoch, effectively an
  // alias for createdAt - /api/user/backup deliberately does not reset it on
  // restore, so a migrated account's schedule and analytics both span its
  // full combined history rather than resetting to the restore date.
  const analyticsStartDate = user?.analyticsStartDate || user?.createdAt;

  let workingDays = settings?.workingDays || 'Monday,Tuesday,Wednesday,Thursday,Friday';
  if (workingDays && !workingDays.includes('-')) {
    const datesStr = convertWeekdaysToDates(workingDays, analyticsStartDate);
    await db.setting.upsert({
      where: { userId: session.userId },
      update: { workingDays: datesStr },
      create: {
        userId: session.userId,
        workingDays: datesStr,
        workStart: '08:00',
        workEnd: '18:00',
        deepWorkStart: '09:00',
        deepWorkEnd: '17:00'
      }
    });
    workingDays = datesStr;
  }

  const defaults = buildSettingsDefaults(settings);

  return NextResponse.json({
    ...defaults,
    workingDays,
    notificationPreferences: (settings?.notificationPreferences as Record<string, boolean> | null) || {},
    name: user?.name || '',
    timezone: user?.timezone || 'UTC',
    theme: user?.theme || 'dark',
    avatarUrl: user?.avatarUrl || '',
    isOnboarded: user?.isOnboarded || false,
    createdAt: user?.createdAt || new Date().toISOString(),
    analyticsStartDate: analyticsStartDate || new Date().toISOString()
  });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const { name, timezone, theme, isOnboarded } = body;

    let targetWorkingDays = body.workingDays;
    if (targetWorkingDays && !targetWorkingDays.includes('-')) {
      const user = await db.user.findUnique({ where: { id: session.userId } });
      targetWorkingDays = convertWeekdaysToDates(targetWorkingDays, user?.analyticsStartDate || user?.createdAt);
    }

    const { notificationPreferences: rawNotificationPreferences, ...restBody } = body;
    const payload = buildSettingsPayload({ ...restBody, ...(targetWorkingDays !== undefined ? { workingDays: targetWorkingDays } : {}) });
    const notificationPreferences = sanitizeNotificationPreferences(rawNotificationPreferences);

    const settings = await db.setting.upsert({
      where: { userId: session.userId },
      update: { ...payload, ...(notificationPreferences ? { notificationPreferences } : {}) },
      create: {
        userId: session.userId,
        ...payload,
        ...(notificationPreferences ? { notificationPreferences } : {})
      }
    });

    // Update user profile fields if provided
    if (name !== undefined || timezone !== undefined || theme !== undefined || isOnboarded !== undefined) {
      await db.user.update({
        where: { id: session.userId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
          ...(theme !== undefined ? { theme } : {}),
          ...(isOnboarded !== undefined ? { isOnboarded } : {})
        }
      });
    }

    return NextResponse.json(settings);
  } catch (err) {
    console.error('Error updating settings:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
