import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canEditProject, getMembership, getTeamVisibleProjectContext, isOwnerOrLeader } from '@/lib/teams';
import { seedProjectNotebookSections } from '@/lib/notebookDefaults';

const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).nullable().optional(),
  goals: z.unknown().optional(),
  startDate: z.string().max(60).nullable().optional(),
  deadline: z.string().max(60).nullable().optional(),
  status: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  color: z.string().max(32).optional(),
  createNotebook: z.boolean().optional(),
  teamId: z.string().max(200).nullable().optional(),
  collaboratorUserIds: z.array(z.string().max(200)).optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const personal = await db.project.findMany({ where: { userId: session.userId } });
  const seen = new Set(personal.map((p: any) => p.id));
  const extra: any[] = [];

  // Team-derived visibility, additive to personal projects: an Owner sees
  // every project belonging to a team they own, unconditionally; anyone
  // else only sees a team project if explicitly added as a collaborator.
  // Never derived from the TeamSubgroupMember relationship (see
  // docs/Plan_overhaul.md Phase 7).
  const { ownedTeamIds, collaboratorProjectIds } = await getTeamVisibleProjectContext(session.userId);

  for (const teamId of ownedTeamIds) {
    const teamProjects = await db.project.findMany({ where: { teamId } });
    for (const p of teamProjects) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        extra.push(p);
      }
    }
  }

  for (const projectId of collaboratorProjectIds) {
    if (seen.has(projectId)) continue;
    const p = await db.project.findUnique({ where: { id: projectId } });
    if (p) {
      seen.add(projectId);
      extra.push(p);
    }
  }

  // Computed here (not just on the single-project GET) so list-level UI -
  // e.g. the Tasks page's project picker deciding whether to offer an
  // "assign to" field - never has to re-derive the RBAC rule itself.
  const all = [...personal, ...extra];
  const withCanEdit = await Promise.all(
    all.map(async (p: any) => ({ ...p, canEdit: await canEditProject(p, session.userId) }))
  );

  return NextResponse.json(withCanEdit);
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, description, goals, startDate, deadline, status, priority, color, createNotebook, teamId, collaboratorUserIds } = parsed.data;

  try {
    // Team-scoped projects: only the Owner or a Team Leader can create one -
    // Members work within projects they're added to, not create new team
    // ones themselves (their personal space is unaffected either way).
    if (teamId) {
      const membership = await getMembership(teamId, session.userId);
      if (!membership || !isOwnerOrLeader(membership.role)) {
        return NextResponse.json({ error: 'Only the team owner or a team leader can create a team project.' }, { status: 403 });
      }
    }

    const project = await db.project.create({
      data: {
        name,
        description,
        goals,
        startDate: startDate ? new Date(startDate) : null,
        deadline: deadline ? new Date(deadline) : null,
        status: status || 'ACTIVE',
        priority: priority || 'MEDIUM',
        color: color || '#71717A',
        userId: session.userId,
        teamId: teamId || null
      }
    });

    if (teamId && Array.isArray(collaboratorUserIds)) {
      for (const userId of collaboratorUserIds) {
        const collabMembership = await getMembership(teamId, userId);
        if (collabMembership) {
          await db.projectCollaborator.create({ data: { projectId: project.id, userId } });
        }
      }
    }

    if (createNotebook) {
      try {
        const notebook = await db.notebook.create({
          data: {
            title: `${name} Notebook`,
            projectId: project.id,
            userId: session.userId,
            isPersonal: false
          }
        });
        await seedProjectNotebookSections(notebook.id, session.userId);
      } catch (nbErr) {
        console.error('Failed to auto-create notebook for project:', nbErr);
      }
    }
    
    return NextResponse.json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
