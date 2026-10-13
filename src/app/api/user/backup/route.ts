import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { validateBackup, BackupError, type BackupPayload } from '@/lib/backup';
import { sanitizeBackupLinks } from '@/lib/backupLinks';


export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const userId = session.userId;

    // Fetch all user-scoped data
    const settings = await db.setting.findUnique({ where: { userId } });
    const projects = await db.project.findMany({ where: { userId } });
    const notebooks = await db.notebook.findMany({
      where: { userId }
    });
    const tasks = await db.task.findMany({ where: { userId } });
    const accomplishments = await db.accomplishmentRecord.findMany({ where: { userId } });
    const calendarEvents = await db.calendarEvent.findMany({ where: { userId } });
    const instruments = await db.instrument.findMany({ where: { userId } });
    const jobs = await db.job.findMany({ where: { userId } });
    const notifications = await db.notification.findMany({ where: { userId } });

    // Reference-only summary of team standing. Team membership, chat
    // history, and notebook comments/revisions belong to the team, not to
    // any one member's account, and are never written back by POST below -
    // restoring another member's data into a shared team on their behalf
    // would risk corrupting what the rest of the team sees. This block
    // exists so the export file at least documents what it doesn't cover,
    // rather than silently omitting it (see Settings > Data & Export copy).
    const teamMemberships = await db.teamMembership.findMany({
      where: { userId },
      select: { teamId: true, role: true, joinedAt: true, team: { select: { name: true, ownerId: true } } },
    });

    return NextResponse.json({
      version: '1.0',
      username: session.name,
      exportedAt: new Date().toISOString(),
      settings,
      projects,
      notebooks, // each notebook carries its single `page` embedded
      tasks,
      accomplishments,
      calendarEvents,
      instruments,
      jobs,
      notifications,
      // Not restored by POST - see note above.
      teamMembershipsReference: teamMemberships,
    });
  } catch (err) {
    console.error('Failed to export user data:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const userId = session.userId;
    let data: BackupPayload;
    try {
      data = validateBackup(await req.json());
    } catch (e) {
      const message = e instanceof BackupError ? e.message : 'This isn’t a valid Rune backup file.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // Re-check every cross-record link before anything is deleted.
    data = await sanitizeBackupLinks(data, userId);

    // Run clean and insert in transaction to prevent partial state on failure
    await db.$transaction(async (tx) => {
      // 1. Delete all current user-scoped data
      await tx.setting.deleteMany({ where: { userId } });
      await tx.task.deleteMany({ where: { userId } });
      await tx.calendarEvent.deleteMany({ where: { userId } });
      await tx.accomplishmentRecord.deleteMany({ where: { userId } });
      await tx.notebook.deleteMany({ where: { userId } }); // page + attachments deleted via cascade
      await tx.project.deleteMany({ where: { userId } });
      await tx.instrument.deleteMany({ where: { userId } });
      await tx.job.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });

      // 2. Re-create settings
      if (data.settings) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, userId: _, createdAt, updatedAt, ...restSettings } = data.settings;
        await tx.setting.create({
          data: {
            ...restSettings,
            userId
          }
        });
      }

      // 3. Re-create projects, tasks, accomplishments, calendar events,
      // instruments, jobs, and notifications - each row is independent and
      // (per the export above) keeps its own original id, so these are
      // bulk-inserted with createMany instead of one round trip per row.
      // A multi-year notebook's history is thousands of rows; sequential
      // per-row creates inside a single long-held transaction risked
      // Postgres's idle_in_transaction_session_timeout or lock contention on
      // a shared self-hosted instance.
      const stripCommon = <T extends { userId?: unknown; createdAt?: unknown; updatedAt?: unknown }>(row: T) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId: _u, createdAt: _c, updatedAt: _up, ...rest } = row;
        return { ...rest, userId };
      };

      if (Array.isArray(data.projects) && data.projects.length) {
        await tx.project.createMany({ data: data.projects.map(stripCommon) });
      }
      if (Array.isArray(data.tasks) && data.tasks.length) {
        await tx.task.createMany({ data: data.tasks.map(stripCommon) });
      }
      if (Array.isArray(data.accomplishments) && data.accomplishments.length) {
        await tx.accomplishmentRecord.createMany({ data: data.accomplishments.map(stripCommon) });
      }
      if (Array.isArray(data.calendarEvents) && data.calendarEvents.length) {
        await tx.calendarEvent.createMany({ data: data.calendarEvents.map(stripCommon) });
      }
      if (Array.isArray(data.instruments) && data.instruments.length) {
        await tx.instrument.createMany({ data: data.instruments.map(stripCommon) });
      }
      // Runs are created after notebooks (step 5): they link to notebook
      // pages, which get new ids on restore.
      // Notifications: sourceId keeps referencing the job/task above, both
      // of which preserve their original ids on restore.
      if (Array.isArray(data.notifications) && data.notifications.length) {
        await tx.notification.createMany({
          data: data.notifications.map((notif) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { userId: _u, createdAt: _c, ...rest } = notif;
            return { ...rest, userId };
          }),
        });
      }

      // 4. Re-create notebooks and each one's single document. Notebooks
      // don't preserve their original id (a fresh one is generated so the
      // page/attachment chain below can link to it), so each notebook is
      // still a sequential create - but its attachments, which don't need
      // their own id referenced anywhere else, are batched with createMany.
      const newPageIds = new Map<string, string>();
      if (Array.isArray(data.notebooks)) {
        for (const notebook of data.notebooks) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: oldNotebookId, userId: _, createdAt, updatedAt, page, ...restNotebook } = notebook;
          const createdNotebook = await tx.notebook.create({
            data: {
              ...restNotebook,
              userId
            }
          });

          if (page) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: oldPageId, notebookId: __, createdAt: ___, updatedAt: ____, attachments, author, ...restPage } = page;
            const createdPage = await tx.notebookPage.create({
              data: {
                ...restPage,
                notebookId: createdNotebook.id
              }
            });
            if (typeof oldPageId === 'string') newPageIds.set(oldPageId, createdPage.id);

            if (Array.isArray(attachments) && attachments.length) {
              await tx.notebookAttachment.createMany({
                data: attachments.map((att) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { id: oldAttId, pageId: ___a, uploadedAt, ...restAtt } = att;
                  return { ...restAtt, pageId: createdPage.id };
                }),
              });
            }
          }
        }
      }

      // 5. Re-create runs, pointing notebook links at the restored pages.
      // (Creating them before the notebooks used to fail every restore that
      // had a run linked to a notebook: the old page ids no longer exist.)
      if (Array.isArray(data.jobs) && data.jobs.length) {
        await tx.job.createMany({
          data: data.jobs.map((job) => {
            const row = stripCommon(job);
            const pageId = typeof row.notebookPageId === 'string' ? newPageIds.get(row.notebookPageId) ?? null : null;
            return { ...row, notebookPageId: pageId };
          }),
        });
      }
    });

    // analyticsStartDate is deliberately left untouched here: restored data
    // (tasks, calendar events, accomplishments) keeps its original dates, and
    // analytics should report the combined history from the account's true
    // creation date through today - not reset to the restore moment.

    return NextResponse.json({ success: true, message: 'Restore complete' });
  } catch (err) {
    console.error('Failed to import user data:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
