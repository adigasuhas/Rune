import { db } from '@/lib/db';
import { getLocalDateString } from '@/lib/dateUtils';
import { calculateOccupiedHoursForDay, calculateProductivityScore, getPostponeCount } from '@/lib/analyticsUtils';

/**
 * The figures an AccomplishmentRecord stores for one day: what was
 * completed, deep work and total time, projects moved, and the day score.
 * Shared by /api/accomplishments and /api/reviews so a review and a plain
 * accomplishment save write the same numbers.
 */
export async function computeDaySnapshot(userId: string, date: string, tz: string) {
  const allTasks = await db.task.findMany({
    where: { userId }
  });

  const dayTasks = allTasks.filter((t: any) => {
    const taskDateStr = getLocalDateString(t.date, tz);
    return taskDateStr === date;
  });

  const completedTasks = dayTasks.filter((t: any) => t.status === 'COMPLETED');

  const allEvents = await db.calendarEvent.findMany({
    where: { userId }
  });
  const dayEvents = allEvents.filter((e: any) => {
    try {
      const eventDateStr = getLocalDateString(e.start, tz);
      return eventDateStr === date;
    } catch {
      return false;
    }
  });
  const deepWorkHours = calculateOccupiedHoursForDay(date, dayTasks, dayEvents, tz, ['DEEP_WORK']);
  const timeSpent = calculateOccupiedHoursForDay(date, dayTasks, dayEvents, tz);

  const projectIds = Array.from(new Set(completedTasks.map((t: any) => t.projectId).filter(Boolean)));
  const progressedProjects: any[] = [];

  for (const pId of projectIds) {
    const proj = await db.project.findUnique({ where: { id: pId as string } });
    if (proj) {
      progressedProjects.push({
        id: proj.id,
        name: proj.name,
        progress: proj.progress
      });
    }
  }

  // BLOCKED tasks are excluded from the rate denominator (can't complete
  // work waiting on someone else) - matches analyticsUtils.calculateMetrics.
  const rateEligibleToday = dayTasks.filter((t: any) => t.status !== 'BLOCKED');
  const completionRate = rateEligibleToday.length > 0
    ? Math.round((completedTasks.length / rateEligibleToday.length) * 100)
    : 0;
  const postponeCount = dayTasks.reduce((sum: number, t: any) => sum + getPostponeCount(t), 0);
  const productivityScore = calculateProductivityScore({
    completionRate,
    deepWorkHours,
    workHours: timeSpent,
    postponeCount
  });

  return {
    completedTasks: JSON.stringify(completedTasks.map((t: any) => ({ id: t.id, name: t.name, priority: t.priority }))),
    deepWorkHours,
    timeSpent,
    projectsProgressed: JSON.stringify(progressedProjects),
    productivityScore,
  };
}
