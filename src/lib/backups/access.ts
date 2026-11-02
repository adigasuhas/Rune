import { db } from '../db';
import { canEditProject } from '../teams';

/**
 * Who may see, make, download or delete backups. An account backup is its
 * owner's alone. A project's backups (and its schedule) belong to anyone who
 * can edit the project - they can already read everything a backup holds.
 */
export async function projectForBackups(projectId: string, userId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || !(await canEditProject(project, userId))) return null;
  return project;
}

export async function canUseBackup(backup: { userId: string; projectId: string | null }, userId: string): Promise<boolean> {
  if (backup.userId === userId) return true;
  return backup.projectId ? Boolean(await projectForBackups(backup.projectId, userId)) : false;
}
