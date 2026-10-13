import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseDateInTimezone, parseDateTimeInTimezone } from '@/lib/dateUtils';
import { normalizeSessionType } from '@/lib/sessionType';
import { canEditProject, canViewProject } from '@/lib/teams';
import { createNotification } from '@/lib/notify';

const slotSchema = z.object({ startTime: z.string().max(20).optional(), endTime: z.string().max(20).optional() });

const createSchema = z.object({
  name: z.string().trim().min(1).max(500),
  detail: z.string().max(10_000).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
  linkedGoalId: z.string().max(200).nullable().optional(),
  priority: z.string().max(50).optional(),
  date: z.string().min(1).max(60),
  sessionType: z.string().max(50).optional(),
  estimatedTime: z.union([z.string(), z.number()]).optional(),
  context: z.string().max(100).optional(),
  effort: z.union([z.string(), z.number()]).optional(),
  impact: z.union([z.string(), z.number()]).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  startTime: z.string().max(20).nullable().optional(),
  endTime: z.string().max(20).nullable().optional(),
  slots: z.array(slotSchema).optional(),
  assigneeUserId: z.string().max(200).nullable().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const tasks = await db.task.findMany({
      where: { userId: session.userId }
    });

    // Attach the display name of whoever a BLOCKED task is waiting on, and
    // whoever assigned a delegated task, so the task list/detail can render
    // "waiting on X" / "assigned by X" without a lookup per row.
    const peopleIds = Array.from(new Set(
      tasks.flatMap((t: any) => [t.blockedOnUserId, t.assignedById].filter(Boolean))
    )) as string[];
    if (peopleIds.length > 0) {
      const people = await db.user.findMany({ where: { id: { in: peopleIds } } });
      const nameById = new Map(people.map((p: any) => [p.id as string, (p.name || p.email) as string]));
      return NextResponse.json(
        tasks.map((t: any) => ({
          ...t,
          blockedOnName: t.blockedOnUserId ? nameById.get(t.blockedOnUserId) || null : null,
          assignedByName: t.assignedById ? nameById.get(t.assignedById) || null : null
        }))
      );
    }

    return NextResponse.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a task name and a date.' }, { status: 400 });
  }
  const {
    name,
    detail,
    projectId,
    linkedGoalId,
    priority,
    date,
    sessionType,
    estimatedTime,
    context,
    effort,
    impact,
    status,
    notes,
    startTime,
    endTime,
    slots,
    assigneeUserId
  } = parsed.data;

  try {
    let project = null;
    if (projectId) {
      project = await db.project.findUnique({ where: { id: projectId } });
      if (!project || !(await canViewProject(project, session.userId))) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
    }

    // Assigning to someone else is only meaningful on a team project, and
    // only for whoever could already manage that project (Owner
    // unconditionally, or a Team Leader who's a collaborator on it) - a
    // Member can create tasks for themselves but can't hand work to anyone
    // else. The assigned task's userId becomes the assignee, not the
    // creator - see the schema comment on Task.assignedById - so it flows
    // into their own dashboard/calendar/time-tracking with no other code
    // path needing to know assignment exists.
    let taskOwnerId = session.userId;
    let assignedById: string | null = null;
    if (assigneeUserId && assigneeUserId !== session.userId) {
      if (!project || !project.teamId) {
        return NextResponse.json({ error: 'Assigning a task requires a team project.' }, { status: 400 });
      }
      if (!(await canEditProject(project, session.userId))) {
        return NextResponse.json({ error: 'Only the team owner or a team leader with access to this project can assign tasks.' }, { status: 403 });
      }
      if (!(await canViewProject(project, assigneeUserId))) {
        return NextResponse.json({ error: 'assigneeUserId must already have access to this project.' }, { status: 400 });
      }
      taskOwnerId = assigneeUserId;
      assignedById = session.userId;
    }

    const owner = await db.user.findUnique({
      where: { id: taskOwnerId }
    });
    const tz = owner?.timezone || 'UTC';
    const taskDate = parseDateInTimezone(date.split('T')[0], tz);

    const task = await db.task.create({
      data: {
        name,
        detail: detail || '',
        projectId: projectId || null,
        linkedGoalId: linkedGoalId || null,
        priority: priority || 'MEDIUM',
        date: taskDate,
        sessionType: normalizeSessionType(sessionType),
        estimatedTime: estimatedTime !== undefined ? Number(estimatedTime) : 1.0,
        context: context || 'COMPUTER',
        effort: effort !== undefined ? Number(effort) : 5,
        impact: impact !== undefined ? Number(impact) : 5,
        status: status || 'PENDING',
        notes: notes || '',
        startTime: slots && slots.length > 0 ? slots[0].startTime : (startTime || null),
        endTime: slots && slots.length > 0 ? slots[0].endTime : (endTime || null),
        userId: taskOwnerId,
        assignedById,
        // Delegated tasks start out awaiting the assignee's acknowledgment;
        // self-created tasks have no assignment state at all - omitted
        // rather than set to `null` explicitly, since the PrismaPg driver
        // adapter can't bind an untyped NULL for a custom Postgres enum
        // column (the field is nullable with no @default, so omitting it
        // inserts NULL naturally without going through that code path).
        ...(assignedById ? { assignmentStatus: 'PENDING_ACCEPTANCE' as const } : {})
      }
    });

    const slotsToCreate = slots && slots.length > 0
      ? slots.filter((s: any) => s.startTime && s.endTime)
      : (startTime && endTime ? [{ startTime, endTime }] : []);

    const dateStr = date.split('T')[0];
    for (const slot of slotsToCreate) {
      const startDateTime = parseDateTimeInTimezone(dateStr, slot.startTime as string, tz);
      let endDateTime = parseDateTimeInTimezone(dateStr, slot.endTime as string, tz);
      if (endDateTime <= startDateTime) {
        endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
      }

      await db.calendarEvent.create({
        data: {
          title: name,
          start: startDateTime,
          end: endDateTime,
          description: detail || '',
          sessionType: task.sessionType,
          taskId: task.id,
          completed: (status || 'PENDING') === 'COMPLETED',
          userId: taskOwnerId
        }
      });
    }

    const finalTask = await db.task.findUnique({
      where: { id: task.id }
    }) || task;

    if (assignedById) {
      const assigner = await db.user.findUnique({ where: { id: assignedById } });
      const assignerName = assigner?.name || assigner?.email || 'A teammate';
      await createNotification({
        userId: taskOwnerId,
        type: 'TASK_ASSIGNED',
        title: `${assignerName} assigned you a task`,
        body: `“${finalTask.name}”${finalTask.date ? `, due ${new Date(finalTask.date).toLocaleDateString()}` : ''}`,
        sourceType: 'Task',
        sourceId: finalTask.id
      });
    }

    return NextResponse.json(finalTask);
  } catch (err) {
    console.error('Error creating task:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
