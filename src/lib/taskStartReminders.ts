import { getTaskSlotIntervals } from './taskElapsed';

/**
 * "Time to get started" reminders: when a To do (PENDING) task's scheduled
 * slot begins, remind its owner and offer to start it.
 *
 * Each scheduled occurrence has a stable key - the task id plus the slot's
 * start instant. It is the Notification dedupeKey (unique per user in the
 * database), so a reminder is created at most once per occurrence across
 * refreshes, tabs and restarts; moving the slot changes the key, so the
 * old time can never fire and the new one gets its own reminder.
 *
 * Missed-reminder policy: a reminder is due from the slot's start until the
 * slot's end. Opening Rune part-way through a slot shows it once (saying when
 * it was due); once the slot is over, it's history and nothing is shown.
 */

type TaskLike = {
  id: string;
  name: string;
  status?: string;
  assignmentStatus?: string | null;
  date?: string | Date;
  startTime?: string | null;
  endTime?: string | null;
};
type SlotLike = { start: string | Date; end: string | Date; completed?: boolean; taskId?: string | null };

export const START_REMINDER_PREFIX = 'task-start:';

export function startReminderKey(taskId: string, start: Date): string {
  return `${START_REMINDER_PREFIX}${taskId}:${start.toISOString()}`;
}

export function parseStartReminderKey(key: string | null | undefined): { taskId: string; start: string } | null {
  if (!key || !key.startsWith(START_REMINDER_PREFIX)) return null;
  const rest = key.slice(START_REMINDER_PREFIX.length);
  const i = rest.indexOf(':');
  if (i <= 0) return null;
  return { taskId: rest.slice(0, i), start: rest.slice(i + 1) };
}

/** Only the owner's own, accepted, not-yet-started work gets a start reminder. */
function remindable(task: TaskLike): boolean {
  if (task.status !== 'PENDING') return false;
  if (task.assignmentStatus === 'PENDING_ACCEPTANCE' || task.assignmentStatus === 'DECLINED') return false;
  return true;
}

function openSlots(task: TaskLike, events: SlotLike[], timezone: string) {
  return getTaskSlotIntervals(task, events, timezone).filter((s) => !s.completed);
}

export interface DueStartReminder {
  taskId: string;
  name: string;
  start: Date;
  key: string;
  /** Opened after the start (not at it): the copy says when it was due. */
  late: boolean;
}

/** Reminders due at `now` - one per pending task whose slot has begun and not yet ended. */
export function dueStartReminders(tasks: TaskLike[], events: SlotLike[], timezone: string, now: Date): DueStartReminder[] {
  const due: DueStartReminder[] = [];
  for (const task of tasks) {
    if (!remindable(task)) continue;
    for (const slot of openSlots(task, events, timezone)) {
      if (slot.start <= now && now < slot.end) {
        due.push({
          taskId: task.id,
          name: task.name,
          start: slot.start,
          key: startReminderKey(task.id, slot.start),
          late: now.getTime() - slot.start.getTime() > 2 * 60_000,
        });
      }
    }
  }
  return due.sort((a, b) => a.start.getTime() - b.start.getTime() || a.name.localeCompare(b.name));
}

/** The next slot start after `now` among pending tasks - when to look again. */
export function nextStartAt(tasks: TaskLike[], events: SlotLike[], timezone: string, now: Date): Date | null {
  let next: Date | null = null;
  for (const task of tasks) {
    if (!remindable(task)) continue;
    for (const slot of openSlots(task, events, timezone)) {
      if (slot.start > now && (!next || slot.start < next)) next = slot.start;
    }
  }
  return next;
}

/**
 * Whether a reminder (by key) still applies: the task exists, is still
 * pending, still has that exact slot, and the slot isn't over. Anything else
 * - deleted, started, done, blocked, postponed, rescheduled - is obsolete.
 */
export function isStartReminderCurrent(key: string, tasks: TaskLike[], events: SlotLike[], timezone: string, now: Date): boolean {
  const parsed = parseStartReminderKey(key);
  if (!parsed) return false;
  const task = tasks.find((t) => t.id === parsed.taskId);
  if (!task || !remindable(task)) return false;
  return openSlots(task, events, timezone).some((s) => s.start.toISOString() === parsed.start && now < s.end);
}
