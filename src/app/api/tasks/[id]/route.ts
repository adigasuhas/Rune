import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseDateInTimezone, parseDateTimeInTimezone, getLocalDateString, toLocalDayKey } from '@/lib/dateUtils';
import { normalizeSessionType } from '@/lib/sessionType';
import { canEditProject, canViewProject, usersShareATeam } from '@/lib/teams';
import { createNotification } from '@/lib/notify';
import { appendPostponement } from '@/lib/postpone';

const slotSchema = z.object({ startTime: z.string().max(20).optional(), endTime: z.string().max(20).optional() });

const updateSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  detail: z.string().max(10_000).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
  linkedGoalId: z.string().max(200).nullable().optional(),
  priority: z.string().max(50).optional(),
  date: z.string().max(60).optional(),
  sessionType: z.string().max(50).optional(),
  estimatedTime: z.union([z.string(), z.number()]).optional(),
  context: z.string().max(100).optional(),
  effort: z.union([z.string(), z.number()]).optional(),
  impact: z.union([z.string(), z.number()]).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  postponeHistory: z.string().max(2_000_000).optional(),
  // "Postpone": move to `date` and log it. The server writes the history
  // entry from the task's STORED date, so the event is always attributed to
  // the day it was really moved from (not a stale client copy).
  postpone: z.object({ reason: z.string().max(500).nullable().optional() }).optional(),
  blockedReason: z.string().max(500).nullable().optional(),
  blockedOnUserId: z.string().max(200).nullable().optional(),
  slots: z.array(slotSchema).optional(),
  startTime: z.string().max(20).nullable().optional(),
  endTime: z.string().max(20).nullable().optional(),
});

/**
 * The task's own creator/assignee can always manage it. Beyond that, on a
 * team project, whoever could already edit the project (Owner
 * unconditionally, or a Team Leader who's a collaborator on it) can also
 * manage any task on it - the same rule that lets them assign tasks in the
 * first place.
 */
async function canManageTask(task: { userId: string; projectId: string | null }, userId: string): Promise<boolean> {
  if (task.userId === userId) return true;
  if (!task.projectId) return false;
  const project = await db.project.findUnique({ where: { id: task.projectId } });
  return !!project && (await canEditProject(project, userId));
}

async function deleteCalendarEventAndSync(_userId: string, event: { id: string }) {
  await db.calendarEvent.delete({ where: { id: event.id } });
}

/** One task, for API clients (the app itself reads the list). Same 404 rule as edit/delete. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const { id } = await params;
  const task = await db.task.findUnique({ where: { id } });
  if (!task || !(await canManageTask(task, session.userId))) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id }
  });

  if (!task || !(await canManageTask(task, session.userId))) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  try {
    // Calendar/time-tracking data always belongs to the task's owner
    // (task.userId - the assignee, if assigned), never the editor - an
    // Owner/Leader managing someone else's assigned task must not have its
    // calendar entries end up on their own calendar.
    const owner = await db.user.findUnique({
      where: { id: task.userId }
    });
    const tz = owner?.timezone || 'UTC';

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;
    if (data.projectId) {
      const newProject = await db.project.findUnique({ where: { id: data.projectId } });
      if (!newProject || !(await canViewProject(newProject, session.userId))) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
    }
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.detail !== undefined) updateData.detail = data.detail;
    if (data.projectId !== undefined) updateData.projectId = data.projectId || null;
    if (data.linkedGoalId !== undefined) updateData.linkedGoalId = data.linkedGoalId || null;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.date !== undefined) updateData.date = parseDateInTimezone(toLocalDayKey(data.date, tz), tz);
    if (data.sessionType !== undefined) updateData.sessionType = normalizeSessionType(data.sessionType);
    if (data.estimatedTime !== undefined) updateData.estimatedTime = Number(data.estimatedTime);
    if (data.context !== undefined) updateData.context = data.context;
    if (data.effort !== undefined) updateData.effort = Number(data.effort);
    if (data.impact !== undefined) updateData.impact = Number(data.impact);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.postponeHistory !== undefined) updateData.postponeHistory = data.postponeHistory;
    if (data.postpone && data.date !== undefined) {
      const fromDay = getLocalDateString(task.date, tz);
      const toDay = toLocalDayKey(data.date, tz);
      updateData.postponeHistory = appendPostponement(task.postponeHistory, fromDay, toDay, data.postpone.reason);
    }

    // "Blocked / waiting on" — only meaningful while status is BLOCKED; any
    // move to another status clears both fields so a stale blocker can't
    // linger. blockedOnUserId is kept only if it resolves to someone the task
    // owner shares a team with (a lab dependency, not an arbitrary account).
    const effectiveStatus = data.status !== undefined ? data.status : task.status;
    let notifyBlockedUserId: string | null = null;
    if (effectiveStatus === 'BLOCKED') {
      if (data.blockedReason !== undefined) {
        updateData.blockedReason = typeof data.blockedReason === 'string' && data.blockedReason.trim()
          ? data.blockedReason.trim().slice(0, 500)
          : null;
      }
      if (data.blockedOnUserId !== undefined) {
        const candidate = data.blockedOnUserId ? String(data.blockedOnUserId) : null;
        if (candidate && candidate !== task.userId && (await usersShareATeam(task.userId, candidate))) {
          updateData.blockedOnUserId = candidate;
          if (candidate !== task.blockedOnUserId) notifyBlockedUserId = candidate;
        } else {
          updateData.blockedOnUserId = null;
        }
      } else if (task.blockedOnUserId && task.status !== 'BLOCKED') {
        // already had a pointer, staying blocked — re-notify only on transition
      }
    } else if (data.status !== undefined) {
      updateData.blockedReason = null;
      updateData.blockedOnUserId = null;
    }
    
    if (data.slots !== undefined) {
      updateData.startTime = data.slots.length > 0 ? data.slots[0].startTime : null;
      updateData.endTime = data.slots.length > 0 ? data.slots[0].endTime : null;
    } else {
      if (data.startTime !== undefined) updateData.startTime = data.startTime || null;
      if (data.endTime !== undefined) updateData.endTime = data.endTime || null;
    }
    
    const updated = await db.task.update({
      where: { id },
      data: updateData
    });

    const finalDate = updated.date;
    const taskDateStr = getLocalDateString(finalDate, tz);
    
    // Find all existing calendar events linked to this task
    const existingEvents = await db.calendarEvent.findMany({
      where: { userId: task.userId, taskId: id }
    });

    if (data.slots !== undefined) {
      // Recreate all slots
      for (const e of existingEvents) {
        await deleteCalendarEventAndSync(task.userId, e);
      }

      const slotsToCreate = data.slots.filter((s: any) => s.startTime && s.endTime);
      for (const slot of slotsToCreate) {
        const startDateTime = parseDateTimeInTimezone(taskDateStr, slot.startTime as string, tz);
        let endDateTime = parseDateTimeInTimezone(taskDateStr, slot.endTime as string, tz);
        if (endDateTime <= startDateTime) {
          endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
        }

        await db.calendarEvent.create({
          data: {
            title: updated.name,
            start: startDateTime,
            end: endDateTime,
            description: updated.detail || '',
            sessionType: updated.sessionType,
            taskId: updated.id,
            completed: updated.status === 'COMPLETED',
            userId: task.userId
          }
        });
      }
    } else {
      // No new slots array provided.
      // For a multi-slot task, CalendarEvent.completed is independently
      // managed per slot via PUT /api/calendar (see toggleSlotCompletion /
      // toggleTaskSlotCompletion on the client) - Task.status is DERIVED from
      // that, not the other way around. So this generic sync must not cascade
      // `completed` back onto every sibling slot (it would immediately
      // overwrite the very slot completion that triggered this status
      // update), and if nothing event-relevant actually changed, it should
      // skip touching the events at all rather than rewriting every one of
      // them (each rewrite also re-triggers a full actualTime recalculation -
      // doing that N times for a single status toggle is what caused the hang).
      const eventRelevantFieldsChanged =
        data.name !== undefined || data.detail !== undefined || data.sessionType !== undefined || data.date !== undefined;
      const cascadeCompleted = existingEvents.length <= 1;

      if (existingEvents.length <= 1 || eventRelevantFieldsChanged) {
        for (const e of existingEvents) {
          const origStart = new Date(e.start);
          const origEnd = new Date(e.end);

          const getTimeStr = (date: Date) => {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour12: false,
              hour: 'numeric',
              minute: 'numeric'
            });
            const parts = formatter.formatToParts(date);
            const hrs = String(parts.find(p => p.type === 'hour')?.value).padStart(2, '0');
            const mins = String(parts.find(p => p.type === 'minute')?.value).padStart(2, '0');
            return `${hrs}:${mins}`;
          };
          const startStr = getTimeStr(origStart);
          const endStr = getTimeStr(origEnd);

          const startDateTime = parseDateTimeInTimezone(taskDateStr, startStr, tz);
          let endDateTime = parseDateTimeInTimezone(taskDateStr, endStr, tz);
          if (endDateTime <= startDateTime) {
            endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
          }

          await db.calendarEvent.update({
            where: { id: e.id },
            data: {
              title: updated.name,
              description: updated.detail || '',
              start: startDateTime,
              end: endDateTime,
              sessionType: updated.sessionType,
              ...(cascadeCompleted ? { completed: updated.status === 'COMPLETED' } : {})
            }
          });
        }
      }

      if (data.startTime !== undefined || data.endTime !== undefined) {
        const finalStartTime = updated.startTime;
        const finalEndTime = updated.endTime;
        
        if (finalStartTime && finalEndTime) {
          const startDateTime = parseDateTimeInTimezone(taskDateStr, finalStartTime, tz);
          let endDateTime = parseDateTimeInTimezone(taskDateStr, finalEndTime, tz);
          if (endDateTime <= startDateTime) {
            endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
          }
          
          if (existingEvents.length > 0) {
            await db.calendarEvent.update({
              where: { id: existingEvents[0].id },
              data: {
                title: updated.name,
                start: startDateTime,
                end: endDateTime,
                description: updated.detail || '',
                sessionType: updated.sessionType,
                completed: updated.status === 'COMPLETED'
              }
            });
            for (let i = 1; i < existingEvents.length; i++) {
              await deleteCalendarEventAndSync(task.userId, existingEvents[i]);
            }
          } else {
            await db.calendarEvent.create({
              data: {
                title: updated.name,
                start: startDateTime,
                end: endDateTime,
                description: updated.detail || '',
                sessionType: updated.sessionType,
                taskId: updated.id,
                completed: updated.status === 'COMPLETED',
                userId: task.userId
              }
            });
          }
        } else {
          for (const e of existingEvents) {
            await deleteCalendarEventAndSync(task.userId, e);
          }
        }
      }
    }

    const finalUpdated = await db.task.findUnique({
      where: { id }
    }) || updated;

    // Tell the person a task now waits on them (only on the transition, and
    // only if it isn't their own task).
    if (notifyBlockedUserId && notifyBlockedUserId !== session.userId) {
      const actor = await db.user.findUnique({ where: { id: session.userId } });
      const actorName = actor?.name || actor?.email || 'A teammate';
      await createNotification({
        userId: notifyBlockedUserId,
        type: 'TASK_BLOCKED',
        title: `${actorName} is waiting on you`,
        body: `“${finalUpdated.name}” is blocked${finalUpdated.blockedReason ? `: ${finalUpdated.blockedReason}` : ''}.`,
        sourceType: 'Task',
        sourceId: finalUpdated.id,
        dedupeKey: `task:${finalUpdated.id}:blocked`
      });
    }

    return NextResponse.json(finalUpdated);
  } catch (err) {
    console.error('Error updating task:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id }
  });

  if (!task || !(await canManageTask(task, session.userId))) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  // Delete all linked calendar events
  const existingEvents = await db.calendarEvent.findMany({
    where: { userId: task.userId, taskId: id }
  });
  for (const e of existingEvents) {
    await deleteCalendarEventAndSync(task.userId, e);
  }
  
  await db.task.delete({
    where: { id }
  });
  
  return NextResponse.json({ success: true });
}
// PUT already applies only the fields it's given, so PATCH is the same update.
export const PATCH = PUT;

export const dynamic = 'force-dynamic';
