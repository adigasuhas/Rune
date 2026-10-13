import { db } from '@/lib/db';
import { canViewProject, canEditProject } from '@/lib/teams';

interface NotebookLike {
  id: string;
  userId: string;
  projectId: string | null;
}

/**
 * Who can read a notebook (and its pages / comments): its owner always, plus
 * - if it's linked to a project - anyone who can view that project.
 */
export async function canViewNotebook(notebook: NotebookLike, userId: string): Promise<boolean> {
  if (notebook.userId === userId) return true;
  if (!notebook.projectId) return false;
  const project = await db.project.findUnique({ where: { id: notebook.projectId } });
  return !!project && (await canViewProject(project, userId));
}

/**
 * A "reviewer" for the notebook's page-review workflow: not the owner, and
 * able to edit the linked project (team owner, or a team leader who's a
 * collaborator on it). These are the people a "ready for review" ping goes
 * to and the only ones who can mark a page REVIEWED.
 */
export async function canReviewNotebook(notebook: NotebookLike, userId: string): Promise<boolean> {
  if (notebook.userId === userId) return false;
  if (!notebook.projectId) return false;
  const project = await db.project.findUnique({ where: { id: notebook.projectId } });
  return !!project && (await canEditProject(project, userId));
}

/**
 * The user ids to notify when a page is marked ready for review - everyone
 * who can edit the linked project except the notebook owner.
 */
export async function getNotebookReviewerIds(notebook: NotebookLike): Promise<string[]> {
  if (!notebook.projectId) return [];
  const project = await db.project.findUnique({ where: { id: notebook.projectId } });
  if (!project) return [];

  const ids = new Set<string>();
  // The team owner.
  if (project.teamId) {
    const owner = await db.team.findUnique({ where: { id: project.teamId } });
    if (owner?.ownerId) ids.add(owner.ownerId);
  }
  // Team-leader collaborators.
  const collaborators = await db.projectCollaborator.findMany({ where: { projectId: project.id } });
  for (const c of collaborators as any[]) {
    if (await canEditProject(project, c.userId)) ids.add(c.userId as string);
  }
  ids.delete(notebook.userId);
  return Array.from(ids);
}
