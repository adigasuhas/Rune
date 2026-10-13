import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canEditProject, canViewProject, getMembership } from '@/lib/teams';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10_000).nullable().optional(),
  goals: z.unknown().optional(),
  status: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  startDate: z.string().max(60).nullable().optional(),
  deadline: z.string().max(60).nullable().optional(),
  progress: z.union([z.string(), z.number()]).optional(),
  color: z.string().max(32).optional(),
  visibleToSubgroup: z.boolean().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id }
  });

  if (!project || !(await canViewProject(project, session.userId))) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  // Team projects show every task on them regardless of who created each
  // one (that's the point of shared visibility); personal projects keep the
  // original userId-scoped behavior.
  const rawTasks = await db.task.findMany({
    where: project.teamId ? { projectId: id } : { projectId: id, userId: session.userId }
  });

  // On a team project, task.userId is "who this task belongs to" (the
  // assignee, if one was set at creation - see Task.assignedById in the
  // schema) - attach who that is so the task list can show it without a
  // separate round trip per task.
  // Attach the "waiting on" person's name for any BLOCKED task.
  const blockedOnIds = Array.from(
    new Set(rawTasks.filter((t: any) => t.blockedOnUserId).map((t: any) => t.blockedOnUserId as string))
  );
  const blockedOnPeople = blockedOnIds.length
    ? await db.user.findMany({ where: { id: { in: blockedOnIds } } })
    : [];
  const blockedOnName = new Map(blockedOnPeople.map((u: any) => [u.id as string, (u.name || u.email) as string]));
  const withBlockNames = (t: any) =>
    t.blockedOnUserId ? { ...t, blockedOnName: blockedOnName.get(t.blockedOnUserId) || null } : t;

  const tasks = project.teamId
    ? await Promise.all(
        rawTasks.map(async (t: any) => {
          const owner = await db.user.findUnique({ where: { id: t.userId } });
          return { ...withBlockNames(t), ownerName: owner?.name || null, ownerEmail: owner?.email || '' };
        })
      )
    : rawTasks.map(withBlockNames);

  // Computed server-side so the client never has to re-derive the
  // creator/owner/leader-collaborator RBAC rule itself.
  const canEdit = await canEditProject(project, session.userId);

  // Linked notebooks (for the "Pulse" panel's cross-links) - a project can
  // hold more than one notebook now (GoodNotes-style folder), each one
  // continuous document, so what's worth surfacing per notebook is when it
  // was last written to, not a page count.
  const notebooks = (await db.notebook.findMany({ where: { projectId: id } })) as
    { id: string; title: string; page?: { updatedAt: string } | null }[];
  const linkedNotebooks = notebooks.map(nb => ({ id: nb.id, title: nb.title, updatedAt: nb.page?.updatedAt || null }));

  return NextResponse.json({ ...project, tasks, canEdit, linkedNotebooks });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id }
  });

  if (!project || !(await canEditProject(project, session.userId))) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.goals !== undefined) updateData.goals = data.goals;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.deadline !== undefined) updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    if (data.progress !== undefined) updateData.progress = Number(data.progress);
    if (data.color !== undefined) updateData.color = data.color;
    // Only meaningful on a team project.
    if (data.visibleToSubgroup !== undefined) {
      updateData.visibleToSubgroup = project.teamId ? data.visibleToSubgroup === true : false;
    }
    
    const updated = await db.project.update({
      where: { id },
      data: updateData
    });
    
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating project:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id }
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  // Deletion is deliberately a higher bar than editing: the creator or the
  // team owner, never a Team Leader collaborator - destructive actions
  // don't follow the same rule as day-to-day project management.
  let canDelete = project.userId === session.userId;
  if (!canDelete && project.teamId) {
    const membership = await getMembership(project.teamId, session.userId);
    canDelete = membership?.role === 'OWNER';
  }
  if (!canDelete) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  await db.project.delete({
    where: { id }
  });

  return NextResponse.json({ success: true });
}
export const dynamic = 'force-dynamic';
