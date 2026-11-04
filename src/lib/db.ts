import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

/**
 * Database access layer.
 *
 * Everything runs on PostgreSQL through Prisma (the `PrismaPg` driver
 * adapter). The old 2,500-line hand-rolled JSON-file adapter is gone - local
 * development now runs a real Postgres via pglite (`npm run dev:db`), so there
 * is exactly one code path and Prisma's own guarantees (transactions,
 * cascades, constraints) hold everywhere.
 *
 * `db` is a thin facade over `PrismaClient`: most methods forward straight
 * through, and a handful maintain the two derived fields Prisma has no
 * built-in hook for - a project's task-roll-up metrics, and a task's
 * "actual time" summed from its completed calendar slots.
 */

const globalForPrisma = globalThis as unknown as { __runePrisma?: PrismaClient };

function createClient(): PrismaClient {
  // The env is validated at startup (src/lib/env.ts + src/instrumentation.ts);
  // this is the last-line message if something still gets here without a URL.
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Run a local Postgres with `npm run dev:db` (see DEPLOY.md), or point it at a managed database.'
    );
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  // Cache in every environment. The `prisma` proxy below resolves the client on
  // each property access, so without this a production build opened a brand-new
  // client + connection pool per query and exhausted the database's connections.
  globalForPrisma.__runePrisma = client;
  return client;
}

/**
 * Lazily created on first use (not at import) so `next build`'s route
 * collection and unit tests that only touch pure helpers don't need a
 * database connection. Reused across Next dev HMR reloads.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = globalForPrisma.__runePrisma ?? createClient();
    // @ts-expect-error - dynamic delegate access
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// ---------------------------------------------------------------------------
// Derived-field maintenance
// ---------------------------------------------------------------------------

/** Recomputes a project's task-roll-up columns (count / progress / time). */
export async function updateProjectMetrics(projectId: string | null | undefined): Promise<void> {
  if (!projectId) return;
  try {
    // Cancelled tasks are out of the project's plan: neither done nor remaining.
    const tasks = await prisma.task.findMany({ where: { projectId, status: { not: 'CANCELLED' as const } } });
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const timeSpent = tasks
      .filter((t) => t.status === 'COMPLETED')
      .reduce((sum, t) => sum + (t.actualTime || 0), 0);
    const estimatedTimeRemaining = tasks
      .filter((t) => t.status !== 'COMPLETED')
      .reduce((sum, t) => sum + (t.estimatedTime || 0), 0);
    await prisma.project.update({
      where: { id: projectId },
      data: { tasksCompleted: completed, tasksRemaining: total - completed, progress, timeSpent, estimatedTimeRemaining },
    });
  } catch (e) {
    console.error('updateProjectMetrics failed:', e);
  }
}

/**
 * Recomputes a task's `actualTime` (and `timeDifference`) from its completed
 * calendar slots - a task with 3 scheduled slots where 1 is checked off shows
 * that 1 slot's worth of real time, not 0 just because it isn't fully done.
 */
export async function recalculateTaskActualTime(taskId: string | null | undefined): Promise<void> {
  if (!taskId) return;
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return;
    const allEvents = await prisma.calendarEvent.findMany({ where: { taskId } });
    const hoursOf = (e: { start: Date; end: Date }) => (e.end.getTime() - e.start.getTime()) / 3_600_000;
    const actualTime = allEvents.filter((e) => e.completed).reduce((sum, e) => sum + hoursOf(e), 0);
    // Planned keeps up with the schedule: when an open task's time slots add
    // up to more than its estimate (a 2h task given 2h30 of slots), the
    // estimate grows to match. Never shrinks - the estimate can cover work
    // beyond today's slots - never on a finished task, whose estimate is
    // what its actual time is measured against, and never on a task with no
    // estimate (0 means "not estimated", which stays its own thing).
    const scheduled = Math.round(allEvents.reduce((sum, e) => sum + hoursOf(e), 0) * 100) / 100;
    const estimatedTime = task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && task.estimatedTime > 0 && scheduled > task.estimatedTime + 1e-6
      ? scheduled
      : task.estimatedTime;
    await prisma.task.update({
      where: { id: taskId },
      data: { actualTime, timeDifference: actualTime - estimatedTime, ...(estimatedTime !== task.estimatedTime ? { estimatedTime } : {}) },
    });
    if (task.projectId) await updateProjectMetrics(task.projectId);
  } catch (e) {
    console.error('recalculateTaskActualTime failed:', e);
  }
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Args = any;

/**
 * The facade's methods are intentionally loose (`any` in, `any` out): route
 * call-sites pass partial `where` / `data` shapes and the previous adapter did
 * the same. Prisma's real types are still enforced inside this file (the
 * `prisma.*` calls above are fully typed).
 */
interface ModelFacade {
  findMany(args?: Args): Promise<any[]>;
  findUnique(args: Args): Promise<any>;
  findFirst(args?: Args): Promise<any>;
  create(args: Args): Promise<any>;
  createMany(args: Args): Promise<any>;
  update(args: Args): Promise<any>;
  updateMany(args: Args): Promise<any>;
  upsert(args: Args): Promise<any>;
  delete(args: Args): Promise<any>;
  deleteMany(args: Args): Promise<any>;
  count(args?: Args): Promise<number>;
}

/** Forwards every standard method to a Prisma model delegate, resolved lazily. */
function passthrough(getModel: () => any): ModelFacade {
  const m = () => getModel();
  return {
    findMany: (args) => m().findMany(args ?? {}),
    findUnique: (args) => m().findUnique(args),
    findFirst: (args) => m().findFirst(args ?? {}),
    create: (args) => m().create(args),
    createMany: (args) => m().createMany(args),
    update: (args) => m().update(args),
    updateMany: (args) => m().updateMany(args),
    upsert: (args) => m().upsert(args),
    delete: (args) => m().delete(args),
    deleteMany: (args) => m().deleteMany(args),
    count: (args) => m().count(args ?? {}),
  };
}

export const db = {
  isMock: false,

  $transaction: <T>(arg: ((tx: any) => Promise<T>) | any[]): Promise<T> =>
    (prisma.$transaction as any)(arg),

  user: passthrough(() => prisma.user),
  project: passthrough(() => prisma.project),
  accomplishmentRecord: passthrough(() => prisma.accomplishmentRecord),
  firstFocusAck: passthrough(() => prisma.firstFocusAck),
  setting: passthrough(() => prisma.setting),
  notebookPage: passthrough(() => prisma.notebookPage),
  instrument: passthrough(() => prisma.instrument),
  wallNote: passthrough(() => prisma.wallNote),
  team: passthrough(() => prisma.team),
  teamMembership: passthrough(() => prisma.teamMembership),
  teamSubgroupMember: passthrough(() => prisma.teamSubgroupMember),
  teamInvite: passthrough(() => prisma.teamInvite),
  chatMessage: passthrough(() => prisma.chatMessage),
  projectCollaborator: passthrough(() => prisma.projectCollaborator),
  job: passthrough(() => prisma.job),
  notification: passthrough(() => prisma.notification),
  apiToken: passthrough(() => prisma.apiToken),
  notebookComment: passthrough(() => prisma.notebookComment),
  notebookAttachment: passthrough(() => prisma.notebookAttachment),
  backup: passthrough(() => prisma.backup),
  notebookRevision: passthrough(() => prisma.notebookRevision),

  // Notebooks always come with their pages + sub-notebooks embedded (the UI
  // and the backup export both expect that shape). `page` (singular - one
  // continuous document per notebook) nests its attachments too, so a
  // backup export carries attachment metadata without a separate query.
  notebook: {
    ...passthrough(() => prisma.notebook),
    findMany: (args: Args = {}) =>
      prisma.notebook.findMany({ ...args, include: { page: { include: { attachments: true } } } }),
    findUnique: (args: Args) =>
      prisma.notebook.findUnique({ ...args, include: { page: { include: { attachments: true } } } }),
  },

  // Task mutations roll up into the parent project's metrics.
  task: {
    ...passthrough(() => prisma.task),
    create: async (args: Args) => {
      const created = await prisma.task.create(args);
      await updateProjectMetrics(created.projectId);
      return created;
    },
    update: async (args: Args) => {
      const before = await prisma.task.findUnique({ where: args.where });
      const updated = await prisma.task.update(args);
      await recalculateTaskActualTime(updated.id);
      const final = (await prisma.task.findUnique({ where: args.where })) ?? updated;
      if (final.projectId) await updateProjectMetrics(final.projectId);
      if (before?.projectId && before.projectId !== final.projectId) {
        await updateProjectMetrics(before.projectId);
      }
      return final;
    },
    delete: async (args: Args) => {
      const before = await prisma.task.findUnique({ where: args.where });
      const deleted = await prisma.task.delete(args);
      if (before?.projectId) await updateProjectMetrics(before.projectId);
      return deleted;
    },
  },

  // Calendar-slot completion feeds a task's actual time.
  calendarEvent: {
    ...passthrough(() => prisma.calendarEvent),
    create: async (args: Args) => {
      const created = await prisma.calendarEvent.create(args);
      if (created.taskId) await recalculateTaskActualTime(created.taskId);
      return created;
    },
    update: async (args: Args) => {
      const before = await prisma.calendarEvent.findUnique({ where: args.where });
      const updated = await prisma.calendarEvent.update(args);
      if (updated.taskId) await recalculateTaskActualTime(updated.taskId);
      if (before?.taskId && before.taskId !== updated.taskId) {
        await recalculateTaskActualTime(before.taskId);
      }
      return updated;
    },
    delete: async (args: Args) => {
      const before = await prisma.calendarEvent.findUnique({ where: args.where });
      const deleted = await prisma.calendarEvent.delete(args);
      if (before?.taskId) await recalculateTaskActualTime(before.taskId);
      return deleted;
    },
  },
};
