import { db } from '@/lib/db';
import {
  getLocalDateString,
  getCurrentDateInTimezone,
  startOfWeekDateString,
  parseDateInTimezone
} from '@/lib/dateUtils';

export interface WeeklyDigest {
  weekOf: string; // Monday YYYY-MM-DD of the current week
  lastWeek: {
    completedTasks: number;
    deepWorkHours: number;
  };
  weekAhead: {
    tasksDue: number;
    projectDeadlines: Array<{ id: string; name: string; deadline: string }>;
  };
  blocked: {
    mine: number; // my tasks currently BLOCKED
    onMe: number; // others' tasks waiting on me
  };
}

/**
 * Builds a personal weekly wrap-up + look-ahead. Deliberately blunt numbers,
 * not a score - it exists to be a Monday-morning orienting glance (fresh-start
 * effect / temporal landmark), not another thing to optimise.
 */
export async function computeWeeklyDigest(userId: string): Promise<WeeklyDigest> {
  const user = await db.user.findUnique({ where: { id: userId } });
  const tz = user?.timezone || 'UTC';
  const todayStr = getCurrentDateInTimezone(tz);
  const weekOf = startOfWeekDateString(todayStr, tz);

  const weekStart = parseDateInTimezone(weekOf, tz);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  const tasks = await db.task.findMany({ where: { userId } });

  // Last week's completions (by task date, which is when the work was planned/done).
  let completedTasks = 0;
  let deepWorkHours = 0;
  for (const t of tasks as any[]) {
    const d = new Date(t.date).getTime();
    if (t.status === 'COMPLETED' && d >= lastWeekStart.getTime() && d < weekStart.getTime()) {
      completedTasks++;
      if (t.sessionType === 'DEEP_WORK') deepWorkHours += t.actualTime || 0;
    }
  }

  // This week's task deadlines (open tasks dated within the current week).
  let tasksDue = 0;
  for (const t of tasks as any[]) {
    const d = new Date(t.date).getTime();
    if (
      t.status !== 'COMPLETED' &&
      t.status !== 'BLOCKED' &&
      d >= weekStart.getTime() &&
      d < weekEnd.getTime()
    ) {
      tasksDue++;
    }
  }

  // Project deadlines landing this week or already past and unfinished.
  const projects = await db.project.findMany({ where: { userId } });
  const projectDeadlines = (projects as any[])
    .filter(p => p.status === 'ACTIVE' && p.progress < 100 && p.deadline)
    .filter(p => new Date(p.deadline).getTime() < weekEnd.getTime())
    .map(p => ({ id: p.id as string, name: p.name as string, deadline: getLocalDateString(p.deadline, tz) }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const blockedMine = (tasks as any[]).filter(t => t.status === 'BLOCKED').length;
  const blockedOnMe = await db.task.findMany({ where: { blockedOnUserId: userId, status: 'BLOCKED' } });

  return {
    weekOf,
    lastWeek: { completedTasks, deepWorkHours: Math.round(deepWorkHours * 10) / 10 },
    weekAhead: { tasksDue, projectDeadlines },
    blocked: { mine: blockedMine, onMe: blockedOnMe.length }
  };
}

/** One-line body for the WEEKLY_DIGEST notification. */
export function digestNotificationBody(d: WeeklyDigest): string {
  const bits: string[] = [];
  bits.push(`Last week: ${d.lastWeek.completedTasks} task${d.lastWeek.completedTasks === 1 ? '' : 's'} done`);
  if (d.lastWeek.deepWorkHours > 0) bits.push(`${d.lastWeek.deepWorkHours}h deep work`);
  bits.push(`This week: ${d.weekAhead.tasksDue} task${d.weekAhead.tasksDue === 1 ? '' : 's'} due`);
  if (d.weekAhead.projectDeadlines.length > 0) {
    bits.push(`${d.weekAhead.projectDeadlines.length} project deadline${d.weekAhead.projectDeadlines.length === 1 ? '' : 's'}`);
  }
  if (d.blocked.onMe > 0) bits.push(`${d.blocked.onMe} waiting on you`);
  return bits.join(' · ') + '.';
}
