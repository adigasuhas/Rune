import { db } from './db';
import { isNotificationTypeEnabled } from './notify';
import { dueStartReminders } from './taskStartReminders';

export interface AutoStarted {
  taskId: string;
  name: string;
  /** The slot's start, ISO. */
  start: string;
  /** The notification key: the record that this slot already started the task. */
  key: string;
  /** Rune was opened part-way through the slot, not at its start. */
  late: boolean;
  /** Show a toast for it (the user hasn't turned task notifications off). */
  notify: boolean;
}

/**
 * Moves the caller's To do tasks whose scheduled slot is under way to In
 * progress - once per slot. The slot's notification ("Task started", keyed
 * task-start:<task>:<slot start>, unique per user) is written first and is
 * the record that this slot has been handled: a second tab, a reload, or the
 * user moving the task back to To do never starts it again for that slot.
 * The next slot starts it afresh.
 */
export async function autoStartDueTasks(userId: string, now: Date = new Date()): Promise<AutoStarted[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = user?.timezone || 'UTC';
  const tasks = await db.task.findMany({ where: { userId, status: 'PENDING' } });
  if (tasks.length === 0) return [];
  const events = await db.calendarEvent.findMany({ where: { userId, taskId: { in: tasks.map((t) => t.id) } } });
  const due = dueStartReminders(tasks as never, events as never, tz, now);
  if (due.length === 0) return [];

  const setting = await db.setting.findUnique({ where: { userId }, select: { taskNotificationsEnabled: true } });
  const notify = setting?.taskNotificationsEnabled !== false && (await isNotificationTypeEnabled(userId, 'TASK_REMINDER'));

  const started: AutoStarted[] = [];
  for (const r of due) {
    const at = r.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    try {
      await db.notification.create({
        data: {
          userId,
          type: 'TASK_REMINDER',
          title: 'Task started',
          body: `“${r.name}” moved to In progress: its time began at ${at}.`,
          sourceType: 'Task',
          sourceId: r.taskId,
          dedupeKey: r.key,
          ...(notify ? {} : { read: true, dismissedAt: now }),
        },
      });
    } catch (err) {
      // Already handled for this slot (unique key): leave the task as it is.
      if ((err as { code?: string })?.code === 'P2002') continue;
      throw err;
    }
    const moved = await db.task.updateMany({
      where: { id: r.taskId, userId, status: 'PENDING' },
      data: { status: 'IN_PROGRESS', blockedReason: null, blockedOnUserId: null },
    });
    if (moved.count === 1) {
      started.push({ taskId: r.taskId, name: r.name, start: r.start.toISOString(), key: r.key, late: r.late, notify });
    }
  }
  return started;
}
