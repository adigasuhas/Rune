import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveSessionType, SessionType } from '@/lib/sessionType';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  start: z.string().min(1).max(60),
  end: z.string().min(1).max(60),
  description: z.string().max(10_000).nullable().optional(),
  sessionType: z.string().max(50).nullable().optional(),
  taskId: z.string().max(200).nullable().optional(),
  completed: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(500).optional(),
  start: z.string().max(60).optional(),
  end: z.string().max(60).optional(),
  description: z.string().max(10_000).nullable().optional(),
  sessionType: z.string().max(50).nullable().optional(),
  taskId: z.string().max(200).nullable().optional(),
  completed: z.boolean().optional(),
});

/** Returns the task only if it belongs to `userId` - guards against linking a
 * calendar event to another user's task (a cross-tenant write via `taskId`). */
async function ownedTask(taskId: string | null | undefined, userId: string) {
  if (!taskId) return null;
  const task = await db.task.findUnique({ where: { id: taskId } });
  return task && task.userId === userId ? task : null;
}

/** Force a task and every calendar event linked to it onto the same sessionType. */
async function syncSessionTypeAcrossTaskAndEvents(userId: string, taskId: string, sessionType: SessionType) {
  const task = await ownedTask(taskId, userId);
  if (!task) return;
  await db.task.update({ where: { id: taskId }, data: { sessionType } });
  const siblingEvents = await db.calendarEvent.findMany({ where: { userId } });
  const taskEvents = siblingEvents.filter((e: any) => e.taskId === taskId);
  for (const e of taskEvents) {
    await db.calendarEvent.update({ where: { id: e.id }, data: { sessionType } });
  }
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const events = await db.calendarEvent.findMany({
    where: { userId: session.userId }
  });
  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a title, start time, and end time.' }, { status: 400 });
  }
  const { title, start, end, description, sessionType, taskId, completed } = parsed.data;

  try {
    const linkedTask = await ownedTask(taskId, session.userId);
    const safeTaskId = linkedTask ? taskId : undefined; // ignore a taskId that isn't the caller's
    const finalSessionType = resolveSessionType(sessionType, linkedTask?.sessionType);

    const newEvent = await db.calendarEvent.create({
      data: {
        title,
        start: new Date(start),
        end: new Date(end),
        description: description || '',
        sessionType: finalSessionType,
        taskId: safeTaskId,
        completed: completed === true,
        userId: session.userId
      }
    });

    if (safeTaskId && sessionType !== undefined) {
      await syncSessionTypeAcrossTaskAndEvents(session.userId, safeTaskId, finalSessionType);
    }

    return NextResponse.json(newEvent);
  } catch (err) {
    console.error('Error creating calendar event:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
  }
  const { id, title, start, end, description, sessionType, taskId, completed } = parsed.data;

  try {
    const event = await db.calendarEvent.findUnique({
      where: { id }
    });

    if (!event || event.userId !== session.userId) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (start !== undefined) updateData.start = new Date(start);
    if (end !== undefined) updateData.end = new Date(end);
    if (description !== undefined) updateData.description = description;
    let putTaskLink: string | null | undefined = undefined;
    if (taskId !== undefined) {
      putTaskLink = taskId ? ((await ownedTask(taskId, session.userId)) ? taskId : null) : null;
      updateData.taskId = putTaskLink;
    }
    if (completed !== undefined) updateData.completed = completed === true;

    const targetTaskId = taskId !== undefined ? putTaskLink : event.taskId;
    const linkedTask = await ownedTask(targetTaskId, session.userId);
    updateData.sessionType = resolveSessionType(sessionType, linkedTask?.sessionType ?? event.sessionType);

    const updatedEvent = await db.calendarEvent.update({
      where: { id },
      data: updateData
    });

    if (updatedEvent.taskId && sessionType !== undefined) {
      await syncSessionTypeAcrossTaskAndEvents(session.userId, updatedEvent.taskId, updatedEvent.sessionType);
    }

    return NextResponse.json(updatedEvent);
  } catch (err) {
    console.error('Error updating calendar event:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('id');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
    }

    const event = await db.calendarEvent.findUnique({ where: { id: eventId } });
    if (!event || event.userId !== session.userId) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    await db.calendarEvent.delete({
      where: { id: eventId }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting calendar event:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
