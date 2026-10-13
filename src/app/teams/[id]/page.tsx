'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserAvatar } from '@/components/UserAvatar';
import {
  Users, ArrowLeft, Plus, Copy, Trash2, Crown, ShieldCheck, LogOut,
  Pencil, Check, X as XIcon, Link2, FolderGit2, Loader2, Settings2, MessageSquare
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { TeamChat } from '@/components/TeamChat';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { useConfirm } from '@/components/ConfirmDialog';

type Role = 'OWNER' | 'TEAM_LEADER' | 'MEMBER';

interface Member {
  userId: string;
  role: Role;
  joinedAt: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface Subgroup {
  id: string;
  teamId: string;
  teamLeaderId: string;
  memberId: string;
}

interface TeamStats {
  memberCount: number;
  activeProjects: number;
  blockedTasks: number;
  leaderCount: number;
}

interface TeamDetail {
  id: string;
  name: string;
  ownerId: string;
  myRole: Role;
  members: Member[];
  subgroups: Subgroup[];
  stats: TeamStats;
}

type TeamTab = 'overview' | 'members' | 'chat' | 'settings';

interface Invite {
  id: string;
  teamId: string;
  code: string;
  role: 'TEAM_LEADER' | 'MEMBER';
  createdById: string;
  expiresAt: string | null;
  revoked: boolean;
}

interface SummaryProject {
  id: string;
  name: string;
  color?: string;
  status: string;
  tasksTotal: number;
  tasksCompleted: number;
  estimatedHours: number;
  actualHours: number;
}

interface MemberSummary {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
  projects: SummaryProject[];
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
    totalEstimatedHours: number;
    totalActualHours: number;
  };
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  TEAM_LEADER: 'Team leader',
  MEMBER: 'Member'
};

const ROLE_BADGE_CLASS: Record<Role, string> = {
  OWNER: 'bg-primary-soft text-primary',
  TEAM_LEADER: 'bg-surface-sunken text-ink-secondary',
  MEMBER: 'bg-surface-sunken text-muted-foreground'
};

function memberLabel(m: { name: string | null; email: string } | undefined): string {
  if (!m) return 'Unknown';
  return m.name || m.email;
}

/** A single node in the hierarchy graph (Owner, Team Leader, or Member) - clickable to drill into that person's projects/progress when permitted. */
function HierarchyNode({ person, onClick, clickable, highlight }: { person: Member; onClick: () => void; clickable: boolean; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-md border transition-colors ${
        highlight ? 'bg-primary-soft border-primary/40' : 'bg-surface-raised border-border-strong'
      } ${clickable ? 'hover:border-primary/60 hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      <UserAvatar person={{ id: person.userId, name: person.name, email: person.email, avatarUrl: person.avatarUrl }} size={40} />
      <div className="text-center">
        <p className="text-xs font-bold text-foreground max-w-[8rem] truncate">{memberLabel(person)}</p>
        <span className={`text-[11.5px] font-semibold ${ROLE_BADGE_CLASS[person.role]} px-1.5 py-0.5 rounded-full`}>
          {ROLE_LABEL[person.role]}
        </span>
      </div>
    </button>
  );
}

/** One cell of the header's divided stat strip. `tone` picks the number's color; plain data stays neutral ink, per the design system's "a number is not a status" rule - only Blocked gets the muted slate used for at-a-glance-but-not-alarming counts. */
function StatCell({ n, label, tone }: { n: number; label: string; tone?: 'slate' }) {
  return (
    <div>
      <p className={`font-serif text-[28px] font-medium leading-none tabular-nums ${tone === 'slate' && n > 0 ? 'text-warning' : 'text-foreground'}`}>{n}</p>
      <p className="mt-1.5 text-[13px] text-ink-secondary">{label}</p>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`-mb-px border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors cursor-pointer ${
        active ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeamDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useSession();
  const { toast } = useNotifications();
  const confirm = useConfirm();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'TEAM_LEADER'>('MEMBER');
  const [inviteExpiry, setInviteExpiry] = useState('7');
  const [creatingInvite, setCreatingInvite] = useState(false);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [leaving, setLeaving] = useState(false);
  const [manageSubgroupFor, setManageSubgroupFor] = useState<string | null>(null);

  const [summaryTargetId, setSummaryTargetId] = useState<string | null>(null);
  const [summary, setSummary] = useState<MemberSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [chatTargetUserId, setChatTargetUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TeamTab>('overview');

  const messageMember = (targetUserId: string) => {
    setSummaryTargetId(null);
    setChatTargetUserId(targetUserId);
    setActiveTab('chat');
  };

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
        setNameDraft(data.name);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error('Error fetching team:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${id}/invites`);
      if (res.ok) setInvites(await res.json());
    } catch (err) {
      console.error('Error fetching invites:', err);
    }
  }, [id]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  useEffect(() => {
    if (team && (team.myRole === 'OWNER' || team.myRole === 'TEAM_LEADER')) {
      fetchInvites();
    }
  }, [team, fetchInvites]);

  const isOwner = team?.myRole === 'OWNER';
  const isOwnerOrLeader = team?.myRole === 'OWNER' || team?.myRole === 'TEAM_LEADER';

  const handleSaveName = async () => {
    if (!nameDraft.trim() || !team) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft.trim() })
      });
      if (res.ok) {
        setTeam({ ...team, name: nameDraft.trim() });
        setEditingName(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Rename failed', data.error || 'Couldn’t rename the team. Try again.', 'error');
      }
    } catch (err) {
      console.error('Error renaming team:', err);
      toast('Rename failed', 'Couldn’t rename the team. Try again.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeRole = async (userId: string, role: 'TEAM_LEADER' | 'MEMBER') => {
    try {
      const res = await fetch(`/api/teams/${id}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        await fetchTeam();
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t update role', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error changing member role:', err);
      toast('Couldn’t update role', 'Try again.', 'error');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!(await confirm({ title: 'Remove member?', message: 'They lose access to the team and its shared projects.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      const res = await fetch(`/api/teams/${id}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchTeam();
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t remove member', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error removing member:', err);
      toast('Couldn’t remove member', 'Try again.', 'error');
    }
  };

  const handleLeaveTeam = async () => {
    if (!(await confirm({ title: 'Leave this team?', message: 'You will lose access to its shared projects.', confirmLabel: 'Leave team', danger: true }))) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/teams/${id}/leave`, { method: 'POST' });
      if (res.ok) {
        router.push('/teams');
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t leave team', data.error || 'Try again.', 'error');
        setLeaving(false);
      }
    } catch (err) {
      console.error('Error leaving team:', err);
      toast('Couldn’t leave team', 'Try again.', 'error');
      setLeaving(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTargetId) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/teams/${id}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: transferTargetId })
      });
      if (res.ok) {
        setIsTransferModalOpen(false);
        setTransferTargetId('');
        await fetchTeam();
        toast('Ownership transferred', 'You are now a team leader on this team.', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Transfer failed', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error transferring ownership:', err);
      toast('Transfer failed', 'Try again.', 'error');
    } finally {
      setTransferring(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!team || deleteConfirmText.trim().toLowerCase() !== team.name.trim().toLowerCase()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/teams');
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t delete team', data.error || 'Try again.', 'error');
        setDeleting(false);
      }
    } catch (err) {
      console.error('Error deleting team:', err);
      toast('Couldn’t delete team', 'Try again.', 'error');
      setDeleting(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    try {
      const res = await fetch(`/api/teams/${id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: inviteRole,
          expiresInDays: inviteExpiry.trim() ? Number(inviteExpiry) : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setInvites((prev) => [...prev, data]);
        setIsInviteModalOpen(false);
        setInviteRole('MEMBER');
        setInviteExpiry('7');
      } else {
        toast('Couldn’t create invite', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error creating invite:', err);
      toast('Couldn’t create invite', 'Try again.', 'error');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/teams/${id}/invites/${inviteId}`, { method: 'DELETE' });
      if (res.ok) {
        setInvites((prev) => prev.map((inv) => (inv.id === inviteId ? { ...inv, revoked: true } : inv)));
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t revoke invite', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error revoking invite:', err);
      toast('Couldn’t revoke invite', 'Try again.', 'error');
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/teams/join/${code}`;
    navigator.clipboard.writeText(link).then(
      () => toast('Copied', 'Invite link copied to clipboard.', 'success'),
      () => toast('Copy failed', link, 'error')
    );
  };

  const handleAssignSubgroup = async (teamLeaderId: string, memberId: string) => {
    try {
      const res = await fetch(`/api/teams/${id}/subgroups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamLeaderId, memberId })
      });
      if (res.ok) {
        await fetchTeam();
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t assign member', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error assigning sub-group member:', err);
      toast('Couldn’t assign member', 'Try again.', 'error');
    }
  };

  const handleRemoveSubgroupMember = async (teamLeaderId: string, memberId: string) => {
    try {
      const res = await fetch(
        `/api/teams/${id}/subgroups?teamLeaderId=${encodeURIComponent(teamLeaderId)}&memberId=${encodeURIComponent(memberId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await fetchTeam();
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t remove from group', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error removing sub-group member:', err);
      toast('Couldn’t remove from group', 'Try again.', 'error');
    }
  };

  // Mirrors the server-side rule in the summary endpoint exactly: the Owner
  // can drill into anyone, a Team Leader only into themselves or a Member in
  // their own sub-group, a plain Member only into themselves. Checked
  // client-side purely to decide whether to offer the click affordance at
  // all - the endpoint enforces the real permission regardless.
  const canViewSummary = (targetUserId: string): boolean => {
    if (!team) return false;
    if (team.myRole === 'OWNER' || targetUserId === user?.id) return true;
    if (team.myRole === 'TEAM_LEADER') {
      return team.subgroups.some((s) => s.teamLeaderId === user?.id && s.memberId === targetUserId);
    }
    return false;
  };

  const openSummary = async (targetUserId: string) => {
    if (!canViewSummary(targetUserId)) return;
    setSummaryTargetId(targetUserId);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/teams/${id}/members/${targetUserId}/summary`);
      const data = await res.json();
      if (res.ok) {
        setSummary(data);
      } else {
        setSummaryError(data.error || 'Couldn’t load this summary. Try again.');
      }
    } catch (err) {
      console.error('Error fetching member summary:', err);
      setSummaryError('Couldn’t load this summary. Try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-raised rounded-lg animate-pulse" />
        <div className="h-40 bg-surface-raised rounded-md animate-pulse" />
      </div>
    );
  }

  if (notFound || !team) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Users className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">This team doesn’t exist, or you’re not a member of it.</p>
        <Link href="/teams" className="text-primary text-sm font-semibold">Back to teams</Link>
      </div>
    );
  }

  const owner = team.members.find((m) => m.role === 'OWNER');
  const leaders = team.members.filter((m) => m.role === 'TEAM_LEADER');
  const plainMembers = team.members.filter((m) => m.role === 'MEMBER');
  const membersByLeader = (leaderId: string) =>
    team.subgroups.filter((s) => s.teamLeaderId === leaderId);
  const memberById = (userId: string) => team.members.find((m) => m.userId === userId);
  // A member can report to more than one Leader by design - this is not a
  // strict tree, so both the hierarchy graph and the "reports to" chips need
  // to handle a member appearing under multiple leaders.
  const leadersForMember = (memberId: string) =>
    team.subgroups.filter((s) => s.memberId === memberId).map((s) => memberById(s.teamLeaderId)).filter((m): m is Member => !!m);
  const isInSubgroup = (leaderId: string, memberId: string) =>
    team.subgroups.some((s) => s.teamLeaderId === leaderId && s.memberId === memberId);
  // Members with no leader placement at all must still appear in the
  // hierarchy graph, directly under the Owner - previously they simply
  // vanished from this view (still visible in the flat Members list above,
  // but missing here).
  const unassignedMembers = plainMembers.filter((m) => leadersForMember(m.userId).length === 0);

  return (
    <div className="space-y-6 text-foreground max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/teams"
          className="p-2 -ml-2 rounded-lg hover:bg-surface-raised text-muted-foreground transition-colors" aria-label="Back to teams">
          <ArrowLeft className="w-4 h-4" />
        </Link>

        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="app-title bg-surface-raised border border-border-strong rounded-lg px-2 py-1 flex-1"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName}
              aria-label="Save team name"
              className="p-2 rounded-md bg-primary-soft text-primary hover:bg-primary-soft border border-primary cursor-pointer"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setEditingName(false); setNameDraft(team.name); }}
              aria-label="Cancel rename"
              className="p-2 rounded-md bg-surface-raised text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="app-title truncate">{team.name}</h1>
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="p-1.5 rounded-lg hover:bg-surface-raised text-muted-foreground shrink-0 cursor-pointer" aria-label="Rename team">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <span className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold shrink-0 ${ROLE_BADGE_CLASS[team.myRole]}`}>
          {ROLE_LABEL[team.myRole]}
        </span>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-t border-foreground/75 pt-4 sm:grid-cols-4">
        <StatCell n={team.stats.memberCount} label="Members" />
        <StatCell n={team.stats.activeProjects} label="Active projects" />
        <StatCell n={team.stats.blockedTasks} label="Blocked tasks" tone="slate" />
        <StatCell n={team.stats.leaderCount} label="Team leaders" />
      </div>

      {team.stats.memberCount === 1 && isOwnerOrLeader && (
        <p className="text-[14px] text-ink-secondary">
          It’s just you so far.{' '}
          <button type="button" onClick={() => setActiveTab('settings')} className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">Invite people</button>{' '}
          with a link; they join as members and you choose what they see.
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
        <TabButton label="Members" active={activeTab === 'members'} onClick={() => setActiveTab('members')} />
        <TabButton label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
        {isOwnerOrLeader && <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
      </div>

      {/* Members */}
      {activeTab === 'members' && (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Members ({team.members.length})
          </h2>
        </div>
        <div className="divide-y divide-border">
          {team.members.map((m) => {
            const reportsTo = m.role === 'MEMBER' ? leadersForMember(m.userId) : [];
            const clickable = canViewSummary(m.userId);
            return (
            <div key={m.userId} className="flex items-center justify-between py-3 gap-3">
              <button
                type="button"
                onClick={() => clickable && openSummary(m.userId)}
                disabled={!clickable}
                className={`flex items-center gap-3 min-w-0 text-left ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}
              >
                <UserAvatar
                  person={{ id: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl }}
                  size={32}
                  className={clickable ? 'group-hover:ring-2 group-hover:ring-primary/40' : ''}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${clickable ? 'text-foreground group-hover:text-primary' : 'text-foreground'}`}>
                    {memberLabel(m)} {m.userId === user?.id && <span className="text-muted-foreground font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  {reportsTo.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {reportsTo.map((leader) => (
                        <span key={leader.userId} className="text-[9px] font-semibold text-ink-secondary bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full">
                          Reports to {memberLabel(leader)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {isOwner && m.role !== 'OWNER' ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.userId, e.target.value as 'TEAM_LEADER' | 'MEMBER')}
                    className="bg-surface-raised border border-border rounded-lg px-2 py-1 text-xs font-semibold text-foreground cursor-pointer"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="TEAM_LEADER">Team leader</option>
                  </select>
                ) : (
                  <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${ROLE_BADGE_CLASS[m.role]}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                )}

                {m.userId !== user?.id && (
                  <button
                    type="button"
                    onClick={() => messageMember(m.userId)}
                    title="Message"
                    aria-label={`Message ${memberLabel(m)}`}
                    className="p-1.5 rounded-lg hover:bg-surface-raised text-muted-foreground hover:text-primary cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                )}

                {isOwner && m.role !== 'OWNER' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setTransferTargetId(m.userId); setIsTransferModalOpen(true); }}
                      title="Transfer ownership"
                      className="p-1.5 rounded-lg hover:bg-surface-raised text-muted-foreground hover:text-primary cursor-pointer" aria-label="Transfer ownership">
                      <Crown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.userId)}
                      title="Remove from team"
                      className="p-1.5 rounded-lg hover:bg-danger-soft text-muted-foreground hover:text-danger cursor-pointer" aria-label="Remove from team">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {m.userId === user?.id && m.role !== 'OWNER' && (
                  <button
                    type="button"
                    onClick={handleLeaveTeam}
                    disabled={leaving}
                    aria-label="Leave team" title="Leave team"
                    className="p-1.5 rounded-lg hover:bg-danger-soft text-muted-foreground hover:text-danger cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </section>
      )}

      {/* Chat */}
      {activeTab === 'chat' && (
      <section id="team-chat-section" className="space-y-3">
        <TeamChat
          teamId={team.id}
          currentUserId={user?.id || ''}
          myRole={team.myRole}
          members={team.members}
          subgroups={team.subgroups}
          preselectUserId={chatTargetUserId}
        />
      </section>
      )}

      {/* Team Hierarchy */}
      {activeTab === 'overview' && (
      <section className="bg-surface border border-border rounded-md p-5 space-y-4 overflow-x-auto">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-ink-faint" /> Team hierarchy
        </h2>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Select a person to see their projects and progress. Group placement is for organization only and doesn’t give anyone access to projects. A member can report to more than one leader.
        </p>

        <div className="flex flex-col items-center pt-2 min-w-max mx-auto">
          {owner && (
            <>
              <HierarchyNode
                person={owner}
                highlight
                clickable={canViewSummary(owner.userId)}
                onClick={() => openSummary(owner.userId)}
              />
              {(leaders.length > 0 || unassignedMembers.length > 0) && <div className="w-px h-6 bg-border-strong" />}
            </>
          )}

          {leaders.length === 0 && unassignedMembers.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-2">No team leaders yet. Promote a member to build the hierarchy.</p>
          ) : (
            <div className="border-t border-border-strong pt-6 flex flex-wrap justify-center gap-8">
              {leaders.map((leader) => {
                const canManage = isOwner || (team.myRole === 'TEAM_LEADER' && leader.userId === user?.id);
                const subMembers = membersByLeader(leader.userId);
                const managingOpen = manageSubgroupFor === leader.userId;
                return (
                  <div key={leader.userId} className="flex flex-col items-center gap-2 relative">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-px h-6 bg-border-strong" />
                    <HierarchyNode
                      person={leader}
                      clickable={canViewSummary(leader.userId)}
                      onClick={() => openSummary(leader.userId)}
                    />
                    <div className="w-px h-4 bg-border" />
                    <div className="min-w-[9.5rem] max-w-[15rem] bg-surface-raised/50 border border-dashed border-border-strong rounded-md p-2.5 flex flex-col items-center gap-1.5">
                      {subMembers.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground py-1">No members yet</p>
                      ) : (
                        subMembers.map((s) => {
                          const mem = memberById(s.memberId);
                          if (!mem) return null;
                          const memClickable = canViewSummary(mem.userId);
                          return (
                            <div key={s.id} className="w-full flex items-center justify-between gap-1.5 bg-surface border border-border rounded-lg px-2 py-1">
                              <button
                                type="button"
                                onClick={() => memClickable && openSummary(mem.userId)}
                                disabled={!memClickable}
                                className={`text-[11px] font-semibold truncate text-left ${memClickable ? 'text-foreground hover:text-primary cursor-pointer' : 'text-foreground cursor-default'}`}
                              >
                                {memberLabel(mem)}
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubgroupMember(leader.userId, mem.userId)}
                                  className="text-muted-foreground hover:text-danger cursor-pointer shrink-0" aria-label="Close">
                                  <XIcon className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setManageSubgroupFor(managingOpen ? null : leader.userId)}
                          className="flex items-center gap-1 text-[10px] font-semibold text-primary mt-0.5 cursor-pointer"
                        >
                          <Settings2 className="w-3 h-3" /> Manage
                        </button>
                      )}

                      {canManage && managingOpen && (
                        <div className="w-full mt-1 bg-surface-sunken border border-border rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
                          {plainMembers.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground">No members on this team yet.</p>
                          ) : (
                            plainMembers.map((m) => {
                              const checked = isInSubgroup(leader.userId, m.userId);
                              return (
                                <label key={m.userId} className="flex items-center gap-1.5 text-[10px] text-foreground cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      checked
                                        ? handleRemoveSubgroupMember(leader.userId, m.userId)
                                        : handleAssignSubgroup(leader.userId, m.userId)
                                    }
                                    className="accent-primary w-3 h-3 shrink-0"
                                  />
                                  <span className="truncate">{memberLabel(m)}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {unassignedMembers.length > 0 && (
                <div className="flex flex-col items-center gap-2 relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-px h-6 bg-border-strong" />
                  <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-md border border-dashed border-border-strong bg-surface-raised/50">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <p className="text-[11.5px] font-semibold text-muted-foreground">Unassigned</p>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="min-w-[9.5rem] max-w-[15rem] bg-surface-raised/50 border border-dashed border-border-strong rounded-md p-2.5 flex flex-col items-center gap-1.5">
                    {unassignedMembers.map((mem) => {
                      const memClickable = canViewSummary(mem.userId);
                      return (
                        <div key={mem.userId} className="w-full flex items-center bg-surface border border-border rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => memClickable && openSummary(mem.userId)}
                            disabled={!memClickable}
                            className={`text-[11px] font-semibold truncate text-left ${memClickable ? 'text-foreground hover:text-primary cursor-pointer' : 'text-foreground cursor-default'}`}
                          >
                            {memberLabel(mem)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      )}

      {/* Settings: invites + danger zone */}
      {activeTab === 'settings' && isOwnerOrLeader && (
      <div className="space-y-6">
      {/* Invites */}
      {isOwnerOrLeader && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> Invite links
            </h2>
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New invite
            </button>
          </div>

          {invites.length === 0 ? (
            <p className="text-xs text-muted-foreground">No invites yet. Create one to bring people onto this team.</p>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => {
                const expired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
                const inactive = inv.revoked || expired;
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border ${inactive ? 'border-border bg-surface-sunken/40 opacity-60' : 'border-border-strong bg-surface-raised'}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{inv.code}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Joins as {ROLE_LABEL[inv.role]}
                        {inv.revoked ? ' · Revoked' : expired ? ' · Expired' : inv.expiresAt ? ` · Expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ' · No expiry'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!inactive && (
                        <button
                          type="button"
                          onClick={() => copyInviteLink(inv.code)}
                          title="Copy invite link"
                          className="p-1.5 rounded-lg hover:bg-surface-sunken text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Copy invite link">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!inv.revoked && (
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(inv.id)}
                          title="Revoke invite"
                          className="p-1.5 rounded-lg hover:bg-danger-soft text-muted-foreground hover:text-danger cursor-pointer" aria-label="Revoke invite">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Danger zone */}
      {isOwner && (
        <section className="border border-danger/20 bg-danger-soft/20 rounded-md p-5 space-y-3">
          <h2 className="text-sm font-bold text-danger">Danger zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Delete this team</p>
              <p className="text-[11px] text-muted-foreground">Projects are kept but removed from the team. Memberships are deleted.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="px-4 py-2 bg-danger hover:bg-danger-hover text-danger-foreground text-xs font-bold rounded-md transition-colors cursor-pointer shrink-0"
            >
              Delete team
            </button>
          </div>
        </section>
      )}
      </div>
      )}

      {/* Create invite modal */}
      {isInviteModalOpen && (
        <Modal onClose={() => setIsInviteModalOpen(false)} size="sm">
          <Modal.Header title="New invite link" onClose={() => setIsInviteModalOpen(false)} />
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div>
              <label htmlFor="page-joins-as" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Joins as</label>
              <select id="page-joins-as"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'TEAM_LEADER')}
                className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm cursor-pointer"
              >
                <option value="MEMBER">Member</option>
                {isOwner && <option value="TEAM_LEADER">Team leader</option>}
              </select>
            </div>
            <div>
              <label htmlFor="page-expires-in-days" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Expires in (days)</label>
              <input id="page-expires-in-days"
                type="number"
                min="1"
                value={inviteExpiry}
                onChange={(e) => setInviteExpiry(e.target.value)}
                placeholder="Leave blank for no expiry"
                className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingInvite}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                {creatingInvite ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Transfer ownership modal */}
      {isTransferModalOpen && (
        <Modal onClose={() => setIsTransferModalOpen(false)} size="sm">
          <Modal.Header title="Transfer ownership" onClose={() => setIsTransferModalOpen(false)} />
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Transfer ownership to <strong className="text-foreground">{memberLabel(memberById(transferTargetId))}</strong>?
              You’ll become a team leader on this team.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={transferring}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                {transferring ? 'Transferring…' : 'Transfer ownership'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete team modal */}
      {isDeleteModalOpen && (
        <Modal onClose={() => setIsDeleteModalOpen(false)} size="sm">
          <Modal.Header title="Delete team" onClose={() => setIsDeleteModalOpen(false)} />
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This permanently deletes <strong className="text-foreground">{team.name}</strong> and its memberships.
              Team projects are kept but detached.
            </p>
            <div>
              <label htmlFor="page-type-the-team-name-to-confirm" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">
                Type the team name ({team.name}) to confirm
              </label>
              <input id="page-type-the-team-name-to-confirm"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={team.name}
                className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none focus:border-danger"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTeam}
                disabled={deleting || deleteConfirmText.trim().toLowerCase() !== team.name.trim().toLowerCase()}
                className="px-5 py-2.5 bg-danger hover:bg-danger-hover disabled:opacity-50 disabled:cursor-not-allowed text-danger-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete team permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Drill-down: projects + progress for whoever was clicked in the hierarchy */}
      {summaryTargetId && (
        <Modal onClose={() => setSummaryTargetId(null)} size="md">
          <Modal.Header title={summary ? memberLabel(summary) : 'Loading…'} onClose={() => setSummaryTargetId(null)} />
          {summaryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : summaryError ? (
            <p className="text-sm text-danger py-6 text-center">{summaryError}</p>
          ) : summary ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <UserAvatar person={{ id: summary.userId, name: summary.name, email: summary.email, avatarUrl: summary.avatarUrl }} size={48} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{summary.name || summary.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{summary.email}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold shrink-0 ${ROLE_BADGE_CLASS[summary.role]}`}>
                  {ROLE_LABEL[summary.role]}
                </span>
                {summary.userId !== user?.id && (
                  <button
                    type="button"
                    onClick={() => messageMember(summary.userId)}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Message
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="bg-surface-raised rounded-md p-2.5">
                  <p className="text-lg font-black text-foreground">{summary.taskStats.total}</p>
                  <p className="text-[11.5px] text-muted-foreground">Tasks</p>
                </div>
                <div className="bg-surface-raised rounded-md p-2.5">
                  <p className="text-lg font-black text-success">{summary.taskStats.completed}</p>
                  <p className="text-[11.5px] text-muted-foreground">Done</p>
                </div>
                <div className="bg-surface-raised rounded-md p-2.5">
                  <p className="text-lg font-black text-primary">{summary.taskStats.inProgress}</p>
                  <p className="text-[11.5px] text-muted-foreground">Active</p>
                </div>
                <div className="bg-surface-raised rounded-md p-2.5">
                  <p className="text-lg font-black text-[var(--color-data-slate)]">{summary.taskStats.blocked}</p>
                  <p className="text-[11.5px] text-muted-foreground">Blocked</p>
                </div>
                <div className="bg-surface-raised rounded-md p-2.5">
                  <p className="text-lg font-black text-foreground">{summary.taskStats.totalActualHours.toFixed(1)}h</p>
                  <p className="text-[11.5px] text-muted-foreground">Logged</p>
                </div>
              </div>

              <div>
                <h3 className="text-[12.5px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5" /> Projects ({summary.projects.length})
                </h3>
                {summary.projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No team projects yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {summary.projects.map((p) => {
                      const pct = p.tasksTotal > 0 ? Math.round((p.tasksCompleted / p.tasksTotal) * 100) : 0;
                      return (
                        <Link
                          key={p.id}
                          href={`/projects/${p.id}`}
                          onClick={() => setSummaryTargetId(null)}
                          className="block bg-surface-raised/60 hover:bg-surface-raised border border-border rounded-md p-3 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5 min-w-0 truncate">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#71717A' }} />
                              <span className="truncate">{p.name}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">{p.tasksCompleted}/{p.tasksTotal}</span>
                          </div>
                          <div className="w-full bg-surface-sunken rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-1.5 rounded-full transition-colors" style={{ width: `${pct}%` }} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
