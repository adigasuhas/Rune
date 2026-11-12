import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentDateInTimezone } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

const answer = z.string().trim().max(2000).nullable().optional();
const reflectionSchema = z
  .object({
    productiveMoment: answer,
    timeWaster: answer,
    gladFinished: answer,
    improvement: answer,
    planningRealistic: answer,
    lesson: answer,
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

async function ownTask(taskId: string, userId: string) {
  return db.task.findFirst({ where: { id: taskId, userId }, select: { id: true, status: true, projectId: true } });
}

/** The reflection written for one of the caller's tasks, or null. */
export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { taskId } = await params;
  if (!(await ownTask(taskId, session.userId))) return NextResponse.json({ error: 'That task no longer exists.' }, { status: 404 });
  return NextResponse.json(await db.taskReflection.findUnique({ where: { taskId } }));
}

/**
 * Write or edit the reflection for a finished task. There is only ever one
 * per task: finishing it again edits the same one, and reopening the task
 * keeps it. A new one can only be started for a task that is done.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { taskId } = await params;
  const parsed = reflectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Each answer can be up to 2,000 characters.' }, { status: 400 });
  const task = await ownTask(taskId, session.userId);
  if (!task) return NextResponse.json({ error: 'That task no longer exists.' }, { status: 404 });

  const existing = await db.taskReflection.findUnique({ where: { taskId } });
  if (!existing && task.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Reflections are written once a task is done.' }, { status: 409 });
  }

  const { completedOn, ...answers } = parsed.data;
  const clean = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v ? v : null]));
  let day = completedOn;
  if (!day && !existing) {
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
    day = getCurrentDateInTimezone(user?.timezone || 'UTC');
  }

  const saved = await db.taskReflection.upsert({
    where: { taskId },
    create: { taskId, userId: session.userId, projectId: task.projectId, completedOn: day!, ...clean },
    update: { ...clean, ...(day ? { completedOn: day, projectId: task.projectId } : {}) },
  });
  return NextResponse.json(saved);
}
