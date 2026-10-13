import { db } from '@/lib/db';

/**
 * Resolves an incoming notebookPageId to a value safe to store on a Job: the
 * page id if it exists and belongs to a notebook the caller owns, null
 * otherwise (including an explicit null/'' to clear the link).
 */
export async function resolveOwnedNotebookPageId(
  raw: unknown,
  userId: string
): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null;
  const page = await db.notebookPage.findUnique({ where: { id: raw } });
  if (!page) return null;
  const notebook = await db.notebook.findUnique({ where: { id: page.notebookId } });
  return notebook && notebook.userId === userId ? raw : null;
}

/**
 * A run may link only to the caller's own task (the same set /api/tasks
 * lists). Returns the id, or null to clear the link; throws LinkError for a
 * task that doesn't exist or isn't theirs, so another user's id can't be
 * attached by guessing it.
 */
export async function resolveOwnedTaskId(raw: unknown, userId: string): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null;
  const task = await db.task.findUnique({ where: { id: raw } });
  if (!task || task.userId !== userId) throw new LinkError('That task isn’t available.');
  return raw;
}

/**
 * Instruments a run may use: the caller's own, or one shared with a team
 * they belong to (the set /api/instruments lists).
 */
export async function resolveUsableInstrumentId(raw: unknown, userId: string): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null;
  const instrument = await db.instrument.findUnique({ where: { id: raw } });
  if (instrument && instrument.userId === userId) return raw;
  if (instrument?.teamId) {
    const membership = await db.teamMembership.findFirst({ where: { userId, teamId: instrument.teamId } });
    if (membership) return raw;
  }
  throw new LinkError('That instrument isn’t available.');
}

/** A link the caller isn't allowed to make; routes turn it into a 400. */
export class LinkError extends Error {}
