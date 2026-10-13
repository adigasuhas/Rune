import { db } from '@/lib/db';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  sourceType: string; // "Task" | "Job" | "Notebook" | "Digest"
  sourceId?: string | null;
  /**
   * When set, the write is idempotent on (userId, dedupeKey): a second call
   * with the same key updates the existing row (and un-dismisses it) instead
   * of failing the unique constraint or stacking duplicates.
   */
  dedupeKey?: string | null;
}

/**
 * Whether `userId` wants notifications of this type - opt-out, stored as
 * `Setting.notificationPreferences` (`{[NotificationType]: boolean}`).
 * Absent key or no row at all = enabled, so existing accounts see no
 * behavior change until they actively turn something off in Settings.
 * Fails open: a preference-lookup error should never silently swallow a
 * real notification.
 */
export async function isNotificationTypeEnabled(userId: string, type: string): Promise<boolean> {
  try {
    const setting = await db.setting.findUnique({ where: { userId } });
    const prefs = setting?.notificationPreferences as Record<string, boolean> | null | undefined;
    if (!prefs) return true;
    return prefs[type] !== false;
  } catch (err) {
    console.error('[notify] preference lookup failed, defaulting to enabled', { userId, type }, err);
    return true;
  }
}

/**
 * Server-side notification creation. Unlike POST /api/notifications (which
 * only ever writes for the caller), this can raise a notification for any
 * user - used when one person's action needs to land on someone else's bell
 * (a task marked "waiting on you", a notebook page sent for review, the
 * weekly digest). Best-effort: a notification failure never blocks the
 * action that triggered it.
 */
export async function createNotification(input: NotifyInput): Promise<void> {
  const { userId, type, title, body, sourceType, sourceId, dedupeKey } = input;
  if (!(await isNotificationTypeEnabled(userId, type))) return;
  try {
    if (dedupeKey) {
      await db.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        create: {
          userId,
          type: type as any,
          title,
          body: body ?? null,
          sourceType,
          sourceId: sourceId ?? null,
          dedupeKey
        },
        update: {
          type: type as any,
          title,
          body: body ?? null,
          sourceType,
          sourceId: sourceId ?? null,
          read: false,
          dismissedAt: null,
          createdAt: new Date()
        }
      });
    } else {
      await db.notification.create({
        data: {
          userId,
          type: type as any,
          title,
          body: body ?? null,
          sourceType,
          sourceId: sourceId ?? null
        }
      });
    }
  } catch (err) {
    console.error('[notify] failed to create notification', { userId, type, dedupeKey }, err);
  }
}
