import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLocalDateString } from '@/lib/dateUtils';
import { calculateOccupiedHoursForDay, calculateProductivityScore, getPostponeCount } from '@/lib/analyticsUtils';

const createSchema = z.object({
  date: z.string().min(1).max(30),
  keyAchievements: z.string().max(10_000).nullable().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const records = await db.accomplishmentRecord.findMany({
    where: { userId: session.userId }
  });
  
  return NextResponse.json(records);
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a date.' }, { status: 400 });
  }
  const { date, keyAchievements } = parsed.data;

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId }
    });
    const tz = user?.timezone || 'UTC';
    
    const allTasks = await db.task.findMany({
      where: { userId: session.userId }
    });
    
    const dayTasks = allTasks.filter((t: any) => {
      const taskDateStr = getLocalDateString(t.date, tz);
      return taskDateStr === date;
    });
    
    const completedTasks = dayTasks.filter((t: any) => t.status === 'COMPLETED');
    
    const allEvents = await db.calendarEvent.findMany({
      where: { userId: session.userId }
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

    const record = await db.accomplishmentRecord.upsert({
      where: {
        userId_date: {
          userId: session.userId,
          date
        }
      },
      update: {
        completedTasks: JSON.stringify(completedTasks.map((t: any) => ({ id: t.id, name: t.name, priority: t.priority }))),
        deepWorkHours,
        timeSpent,
        projectsProgressed: JSON.stringify(progressedProjects),
        keyAchievements: keyAchievements || '',
        productivityScore
      },
      create: {
        userId: session.userId,
        date,
        completedTasks: JSON.stringify(completedTasks.map((t: any) => ({ id: t.id, name: t.name, priority: t.priority }))),
        deepWorkHours,
        timeSpent,
        projectsProgressed: JSON.stringify(progressedProjects),
        keyAchievements: keyAchievements || '',
        productivityScore
      }
    });
    
    return NextResponse.json(record);
  } catch (err) {
    console.error('Error generating Daily Accomplishment Record:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
