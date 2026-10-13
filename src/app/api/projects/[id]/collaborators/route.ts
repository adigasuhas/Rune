import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canEditProject, canViewProject, getMembership } from '@/lib/teams';

const addSchema = z.object({ userId: z.string().min(1).max(200) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project || !(await canViewProject(project, session.userId))) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  const collaborators = await db.projectCollaborator.findMany({ where: { projectId: id } });
  const withUsers = await Promise.all(
    collaborators.map(async (c: any) => {
      const user = await db.user.findUnique({ where: { id: c.userId } });
      return { userId: c.userId, addedAt: c.addedAt, name: user?.name || null, email: user?.email || '' };
    })
  );

  return NextResponse.json(withUsers);
}

/** Add a team member as a project collaborator - only valid for team-scoped projects, and only someone who could already edit the project can grant access to others. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project || !(await canEditProject(project, session.userId))) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (!project.teamId) {
      return NextResponse.json({ error: 'Collaborators can only be added to team projects.' }, { status: 400 });
    }

    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { userId } = parsed.data;

    const targetMembership = await getMembership(project.teamId, userId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'userId must be a member of this project\'s team' }, { status: 400 });
    }

    const existing = await db.projectCollaborator.findMany({ where: { projectId: id, userId } });
    if (existing.length > 0) {
      return NextResponse.json(existing[0]);
    }

    const created = await db.projectCollaborator.create({ data: { projectId: id, userId } });
    return NextResponse.json(created);
  } catch (err) {
    console.error('Error adding project collaborator:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project || !(await canEditProject(project, session.userId))) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId query param is required.' }, { status: 400 });
    }

    const entries = await db.projectCollaborator.findMany({ where: { projectId: id, userId } });
    for (const entry of entries) {
      await db.projectCollaborator.delete({ where: { id: entry.id } });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error removing project collaborator:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
