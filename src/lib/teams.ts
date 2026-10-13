import crypto from 'crypto';
import { db } from '@/lib/db';

export type TeamRole = 'OWNER' | 'TEAM_LEADER' | 'MEMBER';

/**
 * Every team-scoped route needs "is this caller actually in this team, and
 * with what role" - centralized here so the RBAC check is identical
 * everywhere instead of hand-rolled per route. A user has at most one
 * membership row per team (enforced by the schema's @@unique([teamId, userId])).
 */
export async function getMembership(teamId: string, userId: string) {
  const memberships = await db.teamMembership.findMany({ where: { teamId, userId } });
  return memberships[0] || null;
}

export function isOwnerOrLeader(role: string): boolean {
  return role === 'OWNER' || role === 'TEAM_LEADER';
}

/** Short, URL-safe invite code - not a security-sensitive secret on its own (revocable, scoped to a role), just needs to be unguessable-ish and easy to share. */
export function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url');
}

interface ProjectLike {
  id: string;
  userId: string;
  teamId: string | null;
  visibleToSubgroup?: boolean;
}

/**
 * True when `leaderId` is a Team Leader in `teamId` AND at least one member
 * of their sub-group is on `project` (its creator, or a collaborator). This
 * is the bound on the opt-in `visibleToSubgroup` grant - a leader only gains
 * read access to a shared project their own people actually work on.
 */
async function leaderHasSubgroupMemberOnProject(
  project: ProjectLike,
  teamId: string,
  leaderId: string
): Promise<boolean> {
  const subgroup = await db.teamSubgroupMember.findMany({ where: { teamId, teamLeaderId: leaderId } });
  if (subgroup.length === 0) return false;
  const memberIds = new Set(subgroup.map((s: any) => s.memberId as string));
  if (memberIds.has(project.userId)) return true;
  const collaborators = await db.projectCollaborator.findMany({ where: { projectId: project.id } });
  return collaborators.some((c: any) => memberIds.has(c.userId as string));
}

/**
 * Creator, the owner of the project's team, an explicit collaborator (any
 * role), or - when the project has opted in via `visibleToSubgroup` - a Team
 * Leader whose sub-group actually works on it.
 */
export async function canViewProject(project: ProjectLike, userId: string): Promise<boolean> {
  if (project.userId === userId) return true;
  if (project.teamId) {
    const membership = await getMembership(project.teamId, userId);
    if (membership?.role === 'OWNER') return true;
    if (
      membership?.role === 'TEAM_LEADER' &&
      project.visibleToSubgroup &&
      (await leaderHasSubgroupMemberOnProject(project, project.teamId, userId))
    ) {
      return true;
    }
  }
  const collaborations = await db.projectCollaborator.findMany({ where: { projectId: project.id, userId } });
  return collaborations.length > 0;
}

/** Creator, the team owner, or a collaborator who is specifically a Team Leader can edit project metadata - a plain Member collaborator can view/work within it but not manage it. */
export async function canEditProject(project: ProjectLike, userId: string): Promise<boolean> {
  if (project.userId === userId) return true;
  if (project.teamId) {
    const membership = await getMembership(project.teamId, userId);
    if (membership?.role === 'OWNER') return true;
    if (membership?.role === 'TEAM_LEADER') {
      const collaborations = await db.projectCollaborator.findMany({ where: { projectId: project.id, userId } });
      if (collaborations.length > 0) return true;
    }
  }
  return false;
}

/**
 * Removes a membership and cleans up everything that would otherwise be
 * left stranded pointing at it - sub-group entries (as either leader or
 * member) and project-collaborator grants on that team's projects. Shared
 * by the owner-initiated removal route and the self-service "leave team"
 * route so both paths clean up identically.
 */
export async function removeMemberAndCleanup(teamId: string, userId: string, membershipId: string) {
  await db.teamMembership.delete({ where: { id: membershipId } });

  const asLeader = await db.teamSubgroupMember.findMany({ where: { teamId, teamLeaderId: userId } });
  const asMember = await db.teamSubgroupMember.findMany({ where: { teamId, memberId: userId } });
  for (const s of [...asLeader, ...asMember]) {
    await db.teamSubgroupMember.delete({ where: { id: s.id } });
  }

  const teamProjects = await db.project.findMany({ where: { teamId } });
  const collaborations = await db.projectCollaborator.findMany({ where: { userId } });
  for (const c of collaborations) {
    if (teamProjects.some((p: any) => p.id === c.projectId)) {
      await db.projectCollaborator.delete({ where: { id: c.id } });
    }
  }
}

/**
 * True when the two users share membership in at least one team. Used to
 * scope "who can I mark a task as waiting on" and "who can I @-reference" to
 * actual collaborators rather than any account in the system.
 */
export async function usersShareATeam(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return false;
  const [a, b] = await Promise.all([
    db.teamMembership.findMany({ where: { userId: userIdA } }),
    db.teamMembership.findMany({ where: { userId: userIdB } })
  ]);
  const teamsA = new Set(a.map((m: any) => m.teamId as string));
  return b.some((m: any) => teamsA.has(m.teamId as string));
}

/** Stable pairing key for a Direct chat thread - order-independent, so "A DMs B" and "B DMs A" land in the same conversation. */
export function buildDirectConversationKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('_');
}

/** Both participants must currently be members of the team - a Direct thread doesn't survive either side leaving (it just becomes unreachable, not deleted). */
export async function canAccessDirectChat(teamId: string, requesterId: string, otherUserId: string): Promise<boolean> {
  if (requesterId === otherUserId) return false;
  const [requesterMembership, otherMembership] = await Promise.all([
    getMembership(teamId, requesterId),
    getMembership(teamId, otherUserId)
  ]);
  return Boolean(requesterMembership && otherMembership);
}

/** That Leader themselves, a Member in their sub-group, or the Owner (sees every Leader-group, consistent with Owner visibility everywhere else in Phase 7) - never a peer Leader or an unrelated Member. */
export async function canAccessLeaderGroupChat(teamId: string, requesterId: string, leaderId: string): Promise<boolean> {
  const requesterMembership = await getMembership(teamId, requesterId);
  if (!requesterMembership) return false;
  if (requesterMembership.role === 'OWNER') return true;
  if (requesterId === leaderId) return requesterMembership.role === 'TEAM_LEADER';

  const subgroupEntries = await db.teamSubgroupMember.findMany({ where: { teamId, teamLeaderId: leaderId, memberId: requesterId } });
  return subgroupEntries.length > 0;
}

/** Whole-team chat - any active membership, any role. */
export async function canAccessTeamChat(teamId: string, requesterId: string): Promise<boolean> {
  const membership = await getMembership(teamId, requesterId);
  return Boolean(membership);
}

/**
 * A contextual discussion thread anchored to a project or task rather than a
 * person/group - conversationKey is "<objectType>:<objectId>". Access
 * mirrors that object's own visibility rule: `canViewProject` for a project
 * thread, and for a task thread, whoever can view its linked project (the
 * thread only exists for team-project-linked tasks) plus the task's own
 * owner/assignee even if their project access has since changed.
 */
export async function canAccessObjectChat(teamId: string, requesterId: string, conversationKey: string): Promise<boolean> {
  const sep = conversationKey.indexOf(':');
  if (sep === -1) return false;
  const objectType = conversationKey.slice(0, sep);
  const objectId = conversationKey.slice(sep + 1);

  if (objectType === 'project') {
    const project = await db.project.findUnique({ where: { id: objectId } });
    if (!project || project.teamId !== teamId) return false;
    return canViewProject(project, requesterId);
  }
  if (objectType === 'task') {
    const task = await db.task.findUnique({ where: { id: objectId } });
    if (!task || !task.projectId) return false;
    if (task.userId === requesterId || task.assignedById === requesterId) return true;
    const project = await db.project.findUnique({ where: { id: task.projectId } });
    if (!project || project.teamId !== teamId) return false;
    return canViewProject(project, requesterId);
  }
  return false;
}

/**
 * The two pieces of team-derived project visibility beyond "I created it":
 * projects belonging to a team I own (Owner sees every team project
 * unconditionally), and projects I've been explicitly added to as a
 * collaborator. Deliberately does NOT consult TeamSubgroupMember - that
 * relationship is organizational only, never a visibility grant (see
 * docs/Plan_overhaul.md Phase 7).
 */
export async function getTeamVisibleProjectContext(userId: string) {
  const ownedTeams = await db.team.findMany({ where: { ownerId: userId } });
  const collaborations = await db.projectCollaborator.findMany({ where: { userId } });
  return {
    ownedTeamIds: ownedTeams.map((t: any) => t.id as string),
    collaboratorProjectIds: collaborations.map((c: any) => c.projectId as string)
  };
}
