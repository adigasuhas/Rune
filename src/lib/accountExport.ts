import { db } from './db';

/**
 * The whole personal workspace in Rune's backup format (version "1.0") - the
 * file Settings → Backups downloads and restores, and the restorable copy
 * inside an automatic account backup. One definition so the two never drift.
 */
export async function buildAccountExport(userId: string, username: string | null | undefined) {
  const [settings, projects, notebooks, tasks, accomplishments, calendarEvents, instruments, jobs, notifications, teamMemberships] = await Promise.all([
    db.setting.findUnique({ where: { userId } }),
    db.project.findMany({ where: { userId } }),
    db.notebook.findMany({ where: { userId } }),
    db.task.findMany({ where: { userId } }),
    db.accomplishmentRecord.findMany({ where: { userId } }),
    db.calendarEvent.findMany({ where: { userId } }),
    db.instrument.findMany({ where: { userId } }),
    db.job.findMany({ where: { userId } }),
    db.notification.findMany({ where: { userId } }),
    // Reference-only summary of team standing. Team membership, chat
    // history, and notebook comments/revisions belong to the team, not to
    // any one member's account, and are never written back by a restore -
    // restoring another member's data into a shared team on their behalf
    // would risk corrupting what the rest of the team sees. This block
    // exists so the export file at least documents what it doesn't cover.
    db.teamMembership.findMany({
      where: { userId },
      select: { teamId: true, role: true, joinedAt: true, team: { select: { name: true, ownerId: true } } },
    }),
  ]);

  return {
    version: '1.0',
    username,
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
    // Not restored - see note above.
    teamMembershipsReference: teamMemberships,
  };
}
