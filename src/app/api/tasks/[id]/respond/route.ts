import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notify';
import { enforceRateLimit } from '@/lib/rateLimit';

const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
  reason: z.string().max(500).optional(),
});

/**
 * Accept/decline a delegated task. Only the assignee can respond, and only
 * while it's still PENDING_ACCEPTANCE - this is assignment state, kept
 * separate from Task.status (execution state), so declining doesn't itself
 * change what the task "is", just whether the assignee has taken it on.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const limited = enforceRateLimit(req, 'task-respond', 20, 5 * 60_000, session.userId);
  if (limited) return limited;

  const { id } = await params;
  const task = await db.task.findUnique({ where: { id } });
  if (!task || task.userId !== session.userId) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  if (task.assignmentStatus !== 'PENDING_ACCEPTANCE') {
    return NextResponse.json({ error: 'This task isn’t waiting for your response.' }, { status: 400 });
  }

  const parsed = respondSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'action must be "accept" or "decline"' }, { status: 400 });
  }
  const { action, reason } = parsed.data;

  const updated = await db.task.update({
    where: { id },
    data: {
      assignmentStatus: action === 'accept' ? 'ACCEPTED' : 'DECLINED',
      declineReason: action === 'decline' && typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null
    }
  });

  if (task.assignedById) {
    const assignee = await db.user.findUnique({ where: { id: session.userId } });
    const assigneeName = assignee?.name || assignee?.email || 'The assignee';
    await createNotification({
      userId: task.assignedById,
      type: action === 'accept' ? 'TASK_ACCEPTED' : 'TASK_DECLINED',
      title: action === 'accept' ? `${assigneeName} accepted a task` : `${assigneeName} declined a task`,
      body: `“${updated.name}”${action === 'decline' && updated.declineReason ? `: ${updated.declineReason}` : ''}`,
      sourceType: 'Task',
      sourceId: updated.id
    });
  }

  return NextResponse.json(updated);
}
export const dynamic = 'force-dynamic';
