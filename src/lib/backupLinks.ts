/**
 * Cross-record links in a restored backup.
 *
 * `validateBackup` (backup.ts) strips server-owned keys, but plain id fields
 * - a task's projectId, a run's taskId, a project's teamId - came through
 * untouched, so an edited file could attach records to another user's
 * project or a team the restorer isn't in. Every link is re-checked here
 * with the same rules the live API applies when a link is made, before any
 * data is deleted. A link that can't be verified is cleared (null) rather
 * than failing the whole restore: the record itself is still the user's.
 *
 * Runs' notebookPageId is handled by the restore itself (notebook pages get
 * new ids there), so it's only cleared here when it isn't in the file.
 */
import { db } from './db';
import { canViewProject, getMembership, usersShareATeam } from './teams';
import type { BackupPayload } from './backup';

type Row = Record<string, unknown>;
const idOf = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export async function sanitizeBackupLinks(data: BackupPayload, userId: string): Promise<BackupPayload> {
  const ids = (rows: Row[]) => new Set(rows.map((r) => idOf(r.id)).filter((x): x is string => Boolean(x)));
  const projectIds = ids(data.projects);
  const taskIds = ids(data.tasks);
  const instrumentIds = ids(data.instruments);
  const pageIds = new Set(
    data.notebooks.map((n: Row) => idOf((n.page as Row | undefined)?.id)).filter((x): x is string => Boolean(x))
  );

  // Memoised lookups so a large backup costs one query per distinct id.
  const memo = <T>(fn: (id: string) => Promise<T>) => {
    const cache = new Map<string, Promise<T>>();
    return (id: string) => {
      if (!cache.has(id)) cache.set(id, fn(id));
      return cache.get(id)!;
    };
  };
  const teamRole = memo(async (teamId) => (await getMembership(teamId, userId))?.role ?? null);
  const sharesTeam = memo((otherId) => usersShareATeam(userId, otherId));
  const viewableProject = memo(async (projectId) => {
    const project = await db.project.findUnique({ where: { id: projectId } });
    return Boolean(project && project.userId !== userId && (await canViewProject(project, userId)));
  });
  const usableInstrument = memo(async (instrumentId) => {
    const inst = await db.instrument.findUnique({ where: { id: instrumentId } });
    return Boolean(inst && inst.userId !== userId && inst.teamId && (await teamRole(inst.teamId)));
  });

  /** A person link is kept for the restorer or someone they share a team with. */
  const person = async (v: unknown) => {
    const id = idOf(v);
    if (!id) return null;
    return id === userId || (await sharesTeam(id)) ? id : null;
  };

  const projects = await Promise.all(
    data.projects.map(async (p: Row) => {
      // Kept for any current member of that team: the project is the
      // restorer's own, and a member can only attach it to their own team
      // (a leader since demoted shouldn't see it turn private on restore).
      const teamId = idOf(p.teamId);
      return { ...p, teamId: teamId && (await teamRole(teamId)) ? teamId : null };
    })
  );

  const tasks = await Promise.all(
    data.tasks.map(async (t: Row) => {
      const projectId = idOf(t.projectId);
      const keepProject = projectId && (projectIds.has(projectId) || (await viewableProject(projectId)));
      return {
        ...t,
        projectId: keepProject ? projectId : null,
        assignedById: await person(t.assignedById),
        blockedOnUserId: await person(t.blockedOnUserId),
      };
    })
  );

  const calendarEvents = data.calendarEvents.map((e: Row) => {
    const taskId = idOf(e.taskId);
    return { ...e, taskId: taskId && taskIds.has(taskId) ? taskId : null };
  });

  const instruments = await Promise.all(
    data.instruments.map(async (i: Row) => {
      const teamId = idOf(i.teamId);
      return { ...i, teamId: teamId && (await teamRole(teamId)) ? teamId : null };
    })
  );

  const jobs = await Promise.all(
    data.jobs.map(async (j: Row) => {
      const taskId = idOf(j.taskId);
      const instrumentId = idOf(j.instrumentId);
      const pageId = idOf(j.notebookPageId);
      return {
        ...j,
        taskId: taskId && taskIds.has(taskId) ? taskId : null,
        instrumentId: instrumentId && (instrumentIds.has(instrumentId) || (await usableInstrument(instrumentId))) ? instrumentId : null,
        notebookPageId: pageId && pageIds.has(pageId) ? pageId : null,
      };
    })
  );

  const notebooks = await Promise.all(
    data.notebooks.map(async (n: Row) => {
      const projectId = idOf(n.projectId);
      const page = n.page as Row | undefined;
      return {
        ...n,
        // A notebook may only belong to one of the restorer's own projects.
        projectId: projectId && projectIds.has(projectId) ? projectId : null,
        ...(page ? { page: { ...page, authorId: await person(page.authorId), reviewRequestedFromId: await person(page.reviewRequestedFromId) } } : {}),
      };
    })
  );

  return { ...data, projects, tasks, calendarEvents, instruments, jobs, notebooks };
}
