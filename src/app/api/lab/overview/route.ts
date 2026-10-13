import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canViewProject, canEditProject } from '@/lib/teams';

/**
 * The lab overview: for every team the caller belongs to, the projects they
 * can see rendered as rows - progress, next deadline, who's blocked, last
 * activity, headcount. One glanceable surface for a PI / team lead instead
 * of opening each project (cognitive load; Theory of Constraints - the
 * blocked column makes the lab's bottlenecks visible at once).
 *
 * Queries are batched (one findMany per entity type across all projects) so
 * this stays flat as a lab grows to dozens of projects.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const memberships = await db.teamMembership.findMany({ where: { userId: session.userId } });
  if (memberships.length === 0) {
    return NextResponse.json({ teams: [], projects: [], summary: { activeProjects: 0, atRisk: 0, blockedTasks: 0 } });
  }

  const teamIds = memberships.map((m: any) => m.teamId as string);
  const teamRows = await db.team.findMany({ where: { id: { in: teamIds } } });
  const roleByTeam = new Map(memberships.map((m: any) => [m.teamId as string, m.role as string]));
  const teams = teamRows.map((t: any) => ({ id: t.id, name: t.name, role: roleByTeam.get(t.id) || 'MEMBER' }));
  const teamNameById = new Map(teamRows.map((t: any) => [t.id as string, t.name as string]));

  const allTeamProjects = await db.project.findMany({ where: { teamId: { in: teamIds } } });

  // Visibility filter (per-project RBAC).
  const visibleProjects: any[] = [];
  for (const p of allTeamProjects as any[]) {
    if (await canViewProject(p, session.userId)) visibleProjects.push(p);
  }
  const projectIds = visibleProjects.map(p => p.id as string);
  if (projectIds.length === 0) {
    return NextResponse.json({ teams, projects: [], summary: { activeProjects: 0, atRisk: 0, blockedTasks: 0 } });
  }

  // Batched lookups.
  const [allTasks, allCollaborators, allNotebooks] = await Promise.all([
    db.task.findMany({ where: { projectId: { in: projectIds } } }),
    db.projectCollaborator.findMany({ where: { projectId: { in: projectIds } } }),
    db.notebook.findMany({ where: { projectId: { in: projectIds } } })
  ]);

  const tasksByProject = new Map<string, any[]>();
  for (const t of allTasks as any[]) {
    if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
    tasksByProject.get(t.projectId)!.push(t);
  }
  const collabByProject = new Map<string, string[]>();
  for (const c of allCollaborators as any[]) {
    if (!collabByProject.has(c.projectId)) collabByProject.set(c.projectId, []);
    collabByProject.get(c.projectId)!.push(c.userId);
  }
  const notebookByProject = new Map<string, any>();
  for (const nb of allNotebooks as any[]) notebookByProject.set(nb.projectId, nb);

  const blockedOwnerIds = new Set<string>();
  for (const t of allTasks as any[]) if (t.status === 'BLOCKED') blockedOwnerIds.add(t.userId);
  const owners = blockedOwnerIds.size
    ? await db.user.findMany({ where: { id: { in: Array.from(blockedOwnerIds) } } })
    : [];
  const ownerName = new Map(owners.map((u: any) => [u.id as string, (u.name || u.email) as string]));

  const canEditCache = new Map<string, boolean>();
  const projectRows: any[] = [];
  for (const project of visibleProjects) {
    const tasks = tasksByProject.get(project.id) || [];
    const blocked = tasks.filter((t: any) => t.status === 'BLOCKED');
    const collaborators = collabByProject.get(project.id) || [];
    const peopleCount = new Set([project.userId, ...collaborators]).size;

    let lastActivityAt = new Date(project.updatedAt).getTime();
    for (const t of tasks) lastActivityAt = Math.max(lastActivityAt, new Date(t.updatedAt).getTime());
    const notebook = notebookByProject.get(project.id);
    if (notebook?.page) {
      lastActivityAt = Math.max(lastActivityAt, new Date(notebook.page.updatedAt).getTime());
    }

    const canEdit = await canEditProject(project, session.userId);
    canEditCache.set(project.id, canEdit);

    projectRows.push({
      id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority,
      progress: project.progress,
      color: project.color,
      deadline: project.deadline,
      teamId: project.teamId,
      teamName: teamNameById.get(project.teamId) || '',
      canEdit,
      taskStats: {
        total: tasks.length,
        completed: tasks.filter((t: any) => t.status === 'COMPLETED').length,
        inProgress: tasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
        blocked: blocked.length
      },
      blockedTasks: blocked.slice(0, 4).map((t: any) => ({
        name: t.name,
        ownerName: ownerName.get(t.userId) || 'Someone',
        blockedReason: t.blockedReason || null
      })),
      peopleCount,
      lastActivityAt: new Date(lastActivityAt).toISOString()
    });
  }

  projectRows.sort((a, b) => {
    const active = (s: string) => (s === 'ACTIVE' ? 0 : 1);
    if (active(a.status) !== active(b.status)) return active(a.status) - active(b.status);
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  const now = Date.now();
  const summary = {
    activeProjects: projectRows.filter(p => p.status === 'ACTIVE').length,
    atRisk: projectRows.filter(
      p => p.status === 'ACTIVE' && p.progress < 100 && p.deadline &&
        new Date(p.deadline).getTime() - now <= 7 * 86400000
    ).length,
    blockedTasks: projectRows.reduce((sum, p) => sum + p.taskStats.blocked, 0)
  };

  return NextResponse.json({ teams, projects: projectRows, summary });
}

export const dynamic = 'force-dynamic';
