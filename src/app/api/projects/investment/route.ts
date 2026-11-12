import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';
import { projectDays } from '@/lib/projectTimeSheet';
import { INVESTMENT_WINDOW_DAYS } from '@/lib/projectEmphasis';

export const dynamic = 'force-dynamic';

const ACTIVITY_DAYS = 14;

function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Your recorded time on each project: focused work (ticked-off and under-way
 * slots, less breaks and brain drain) in total, over the last 30 days, and
 * per day for the last 14. Scheduled-but-unworked time is never counted.
 * What the Projects page's colour depth and activity strip are drawn from.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const userId = session.userId;

  const [user, tasks, sessions] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    db.task.findMany({
      where: { userId, projectId: { not: null }, status: { not: 'CANCELLED' } },
      select: { id: true, name: true, projectId: true, status: true, date: true, estimatedTime: true, actualTime: true, startTime: true, endTime: true, sessionType: true },
    }),
    db.activitySession.findMany({ where: { userId }, select: { kind: true, start: true, end: true } }),
  ]);
  const tz = user?.timezone || 'UTC';
  const taskIds = tasks.map((t: { id: string }) => t.id);
  const [events, reflections] = await Promise.all([
    taskIds.length
      ? db.calendarEvent.findMany({ where: { userId, taskId: { in: taskIds } }, select: { start: true, end: true, taskId: true, completed: true, sessionType: true } })
      : Promise.resolve([]),
    db.taskReflection.findMany({ where: { userId }, select: { taskId: true, completedOn: true } }),
  ]);

  const today = getCurrentDateInTimezone(tz);
  const windowStart = shift(today, -(INVESTMENT_WINDOW_DAYS - 1));
  const strip = Array.from({ length: ACTIVITY_DAYS }, (_, i) => shift(today, i - (ACTIVITY_DAYS - 1)));
  const now = new Date();

  const projectIds = Array.from(new Set(tasks.map((t: { projectId: string | null }) => t.projectId).filter(Boolean))) as string[];
  const projects: Record<string, { totalMs: number; recentMs: number; daily: number[]; lastWorked: string | null }> = {};
  for (const projectId of projectIds) {
    const days = projectDays({ projectId, tasks, events, sessions, reflections, timezone: tz, now });
    const byDate = new Map(days.map((d) => [d.date, d.focusedMs]));
    projects[projectId] = {
      totalMs: days.reduce((s, d) => s + d.focusedMs, 0),
      recentMs: days.filter((d) => d.date >= windowStart && d.date <= today).reduce((s, d) => s + d.focusedMs, 0),
      daily: strip.map((d) => byDate.get(d) || 0),
      lastWorked: days.find((d) => d.focusedMs > 0)?.date ?? null,
    };
  }

  return NextResponse.json({ windowDays: INVESTMENT_WINDOW_DAYS, days: strip, projects });
}
