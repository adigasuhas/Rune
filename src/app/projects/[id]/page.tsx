'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import { useConfirm } from '@/components/ConfirmDialog';
import { useNotifications } from '@/context/NotificationContext';
import { formatRelativeDeadline } from '@/lib/dateUtils';
import { BlockTaskDialog } from '@/components/BlockTaskDialog';
import { ObjectChat } from '@/components/ObjectChat';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  StickyNote,
  BookOpen,
  Eye,
  Ban,
  X as XIcon
} from 'lucide-react';
import { SectionHeader } from '@/components/ui';

interface Task {
  id: string;
  name: string;
  detail?: string;
  priority: string;
  date: string;
  sessionType: string;
  estimatedTime: number;
  context: string;
  status: string;
  blockedReason?: string | null;
  blockedOnUserId?: string | null;
  blockedOnName?: string | null;
  postponeHistory?: string;
  ownerName?: string | null;
  ownerEmail?: string;
}

interface Goal {
  id: string;
  text: string;
  completed: boolean;
}

interface Project {
  id: string;
  name: string;
  description: string;
  goals: string;
  startDate?: string;
  deadline?: string;
  status: string;
  priority?: string;
  progress: number;
  tasksCompleted: number;
  tasksRemaining: number;
  timeSpent: number;
  estimatedTimeRemaining: number;
  tasks?: Task[];
  color?: string;
  teamId?: string | null;
  canEdit?: boolean;
  visibleToSubgroup?: boolean;
  linkedNotebooks?: { id: string; title: string; updatedAt: string | null }[];
}

interface Collaborator {
  userId: string;
  addedAt: string;
  name: string | null;
  email: string;
}

interface TeamMemberOption {
  userId: string;
  role: 'OWNER' | 'TEAM_LEADER' | 'MEMBER';
  name: string | null;
  email: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { user } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useNotifications();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // Completed tasks stay folded away until asked for, so the open work leads.
  const [showDone, setShowDone] = useState(false);
  const [blockingTask, setBlockingTask] = useState<Task | null>(null);
  const [openingNotebook, setOpeningNotebook] = useState(false);

  // Team collaborators
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [addableMembers, setAddableMembers] = useState<TeamMemberOption[]>([]);
  const [showAddCollaborator, setShowAddCollaborator] = useState(false);
  const [addingCollaborator, setAddingCollaborator] = useState(false);

  // Dynamic Goals States
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoalText, setNewGoalText] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Helper to parse project goals
  const parseGoals = (goalsString: string | null): Goal[] => {
    if (!goalsString) return [];
    try {
      const parsed = JSON.parse(goalsString);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return goalsString
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map((line, idx) => ({
          id: `old-${idx}`,
          text: line.replace(/^(-\s*|□\s*|\*\s*)/, ''),
          completed: false
        }));
    }
    return [];
  };

  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          setGoals(parseGoals(data.goals));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjectDetails();
  }, [id, refreshTrigger]);

  const fetchCollaborators = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/collaborators`);
      if (res.ok) setCollaborators(await res.json());
    } catch (err) {
      console.error('Error fetching collaborators:', err);
    }
  }, [id]);

  useEffect(() => {
    if (project?.teamId) fetchCollaborators();
  }, [project, fetchCollaborators]);

  const fetchAddableMembers = useCallback(async () => {
    if (!project?.teamId) return;
    try {
      const res = await fetch(`/api/teams/${project.teamId}`);
      if (res.ok) {
        const data: { members: TeamMemberOption[] } = await res.json();
        const collaboratorIds = new Set(collaborators.map((c) => c.userId));
        setAddableMembers(
          data.members.filter(
            (m) => m.role !== 'OWNER' && m.userId !== user?.id && !collaboratorIds.has(m.userId)
          )
        );
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, [project, collaborators, user]);

  const openAddCollaborator = async () => {
    setShowAddCollaborator(true);
    await fetchAddableMembers();
  };

  // Creates the project's notebook if it doesn't have one yet, then hands
  // off where to land via sessionStorage - same deep-link pattern used for
  // tasks/runs elsewhere in the app. A project can hold more than one
  // notebook now, so this either opens the (single) one directly or, if
  // there are several, opens the library with this project's folder
  // expanded instead of guessing which one the writer wants.
  const handleOpenNotebook = async () => {
    setOpeningNotebook(true);
    try {
      const res = await fetch(`/api/projects/${id}/notebook`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast('Couldn’t open the notebook', data.error || 'Try again.', 'error');
        return;
      }
      try {
        if (data.mode === 'folder') {
          sessionStorage.setItem('rune-deep-link-project-folder-id', data.projectId);
        } else {
          sessionStorage.setItem('rune-deep-link-notebook-id', data.notebook.id);
        }
      } catch { /* private mode */ }
      router.push('/notebook');
    } catch (err) {
      console.error('Error opening project notebook:', err);
      toast('Couldn’t open the notebook', 'Try again.', 'error');
    } finally {
      setOpeningNotebook(false);
    }
  };

  const handleAddCollaborator = async (userId: string) => {
    setAddingCollaborator(true);
    try {
      const res = await fetch(`/api/projects/${id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        await fetchCollaborators();
        setShowAddCollaborator(false);
      }
    } catch (err) {
      console.error('Error adding collaborator:', err);
    } finally {
      setAddingCollaborator(false);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!(await confirm({ title: 'Remove collaborator?', message: 'They will lose access to this project.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      const res = await fetch(`/api/projects/${id}/collaborators?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      if (res.ok) await fetchCollaborators();
    } catch (err) {
      console.error('Error removing collaborator:', err);
    }
  };

  // Persists a goal-list change. On failure it rolls the optimistic update
  // back to `previousGoals` and surfaces why - a silent no-op here is how a
  // view-only collaborator ends up thinking they saved something they didn't.
  const saveGoals = async (updatedGoals: Goal[], previousGoals: Goal[]) => {
    try {
      const totalGoals = updatedGoals.length;
      const completedGoals = updatedGoals.filter(g => g.completed).length;
      const newProgress = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: JSON.stringify(updatedGoals),
          progress: newProgress
        })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        setGoals(previousGoals);
        toast(
          'Change not saved',
          res.status === 404 || res.status === 403
            ? 'You have view-only access to this project.'
            : 'Couldn’t save that objective. Try again.',
          'error'
        );
      }
    } catch (err) {
      console.error('Error saving goals:', err);
      setGoals(previousGoals);
      toast('Change not saved', 'Check your connection and try again.', 'error');
    }
  };

  const toggleGoal = async (goalId: string) => {
    const previousGoals = goals;
    const updatedGoals = goals.map(g => g.id === goalId ? { ...g, completed: !g.completed } : g);
    setGoals(updatedGoals);
    await saveGoals(updatedGoals, previousGoals);
  };

  const deleteGoal = async (goalId: string) => {
    const previousGoals = goals;
    const updatedGoals = goals.filter(g => g.id !== goalId);
    setGoals(updatedGoals);
    await saveGoals(updatedGoals, previousGoals);
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const previousGoals = goals;
    const newGoal: Goal = {
      id: Math.random().toString(36).substring(2, 9),
      text: newGoalText.trim(),
      completed: false
    };
    const updatedGoals = [...goals, newGoal];
    setGoals(updatedGoals);
    setNewGoalText('');
    await saveGoals(updatedGoals, previousGoals);
  };

  const handleSaveEdit = async (goalId: string) => {
    if (!editingText.trim()) return;
    setEditingGoalId(null);
    const previousGoals = goals;
    const updatedGoals = goals.map(g => g.id === goalId ? { ...g, text: editingText.trim() } : g);
    setGoals(updatedGoals);
    await saveGoals(updatedGoals, previousGoals);
  };

  const toggleSubgroupVisibility = async (next: boolean) => {
    const prev = project;
    setProject(p => (p ? { ...p, visibleToSubgroup: next } : p));
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleToSubgroup: next })
      });
      if (!res.ok) {
        setProject(prev);
        toast('Not saved', 'You can’t change sharing on this project.', 'error');
      }
    } catch {
      setProject(prev);
      toast('Not saved', 'Check your connection and try again.', 'error');
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        toast(
          'Change not saved',
          res.status === 404 || res.status === 403
            ? 'You have view-only access to this project.'
            : 'Couldn’t update that task. Try again.',
          'error'
        );
      }
    } catch (e) {
      console.error(e);
      toast('Change not saved', 'Check your connection and try again.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4 text-center py-20 bg-surface rounded-md border border-border">
        <h3 className="text-lg font-bold text-foreground">Project not found</h3>
        <p className="text-muted-foreground text-sm">This project doesn’t exist or was deleted.</p>
        <Link href="/projects" className="inline-flex items-center text-xs text-muted-foreground font-semibold hover:text-foreground underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const canEdit = !!project.canEdit;
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : null;
  const deadlineStr = project.deadline
    ? new Date(project.deadline).toLocaleDateString([], { day: 'numeric', month: 'short' })
    : null;
  const projectSettled = project.status === 'COMPLETED' || project.status === 'ARCHIVED';
  const deadlineRel = projectSettled ? null : formatRelativeDeadline(project.deadline);
  const deadlineOverdue = !projectSettled && project.deadline
    ? new Date(project.deadline).getTime() < Date.now()
    : false;
  const startStr = fmtDate(project.startDate);
  const workingDaysIn = project.startDate
    ? Math.max(0, Math.round((Date.now() - new Date(project.startDate).getTime()) / 86400000 * (5 / 7)))
    : null;

  const doneGoals = goals.filter(g => g.completed).length;
  const goalPct = goals.length > 0 ? Math.round((doneGoals / goals.length) * 100) : 0;
  const estTotalH = project.timeSpent + project.estimatedTimeRemaining;
  const timePct = estTotalH > 0 ? Math.min(100, Math.round((project.timeSpent / estTotalH) * 100)) : 0;
  const inProgTasks = (project.tasks || []).filter(t => t.status === 'IN_PROGRESS').length;
  const todoTasks = (project.tasks || []).filter(t => t.status === 'PENDING').length;

  const statusTone =
    project.status === 'ACTIVE' ? 'border-primary text-primary bg-primary-soft' :
    project.status === 'COMPLETED' ? 'border-border-strong text-ink-secondary bg-surface-sunken' :
    project.status === 'ARCHIVED' ? 'border-border-strong text-ink-faint bg-surface-sunken' :
    'border-border-strong text-ink-secondary bg-surface-sunken';

  return (
    <div className="space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] min-w-0">
          <Link href="/projects" className="text-ink-faint hover:text-foreground transition-colors">Projects</Link>
          <span className="text-ink-faint">·</span>
          <span className="text-foreground truncate">{project.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!!project.linkedNotebooks?.length && (
            <Link
              href="/notebook"
              className="flex h-9 items-center gap-1.5 px-3.5 bg-surface border border-border-strong hover:bg-surface-raised text-foreground text-[14px] font-semibold rounded-[9px] transition-colors"
            >
              <BookOpen className="w-4 h-4 text-ink-faint" /> Open notebook
            </Link>
          )}
          <Link
            href={`/wall?projectId=${project.id}`}
            className="flex h-9 items-center gap-1.5 px-3.5 bg-surface border border-border-strong hover:bg-surface-raised text-foreground text-[14px] font-semibold rounded-[9px] transition-colors"
          >
            <StickyNote className="w-4 h-4 text-ink-faint" /> Open wall
          </Link>
          {canEdit && (
            <Link
              href="/tasks"
              className="flex h-9 items-center gap-1.5 px-3.5 bg-primary hover:bg-primary-hover text-primary-foreground text-[14px] font-semibold rounded-[9px] transition-colors"
            >
              <Plus className="w-4 h-4" /> New task
            </Link>
          )}
        </div>
      </div>

      {/* Title block */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color || 'var(--border-strong)' }} />
          <h1 className="app-title text-foreground">{project.name}</h1>
          {project.status !== 'ACTIVE' && (
            <span className="badge badge-neutral">{project.status === 'ON_HOLD' ? 'On hold' : project.status.charAt(0) + project.status.slice(1).toLowerCase()}</span>
          )}
          {(project.priority === 'HIGH' || project.priority === 'CRITICAL') && (
            <span className={`text-[13px] font-medium ${project.priority === 'CRITICAL' ? 'text-danger' : 'text-warning'}`}>
              {project.priority === 'CRITICAL' ? 'Critical' : 'High priority'}
            </span>
          )}
          {!canEdit && (
            <span className="flex items-center gap-1 text-[13px] text-ink-faint">
              <Eye className="w-3 h-3" /> View only
            </span>
          )}
        </div>
        {project.description && project.description !== 'Demo project' && (
          <p className="text-ink-secondary text-[15px] mt-2 max-w-2xl leading-relaxed">{project.description}</p>
        )}
        <p className="text-[13.5px] text-ink-secondary mt-2">
          {startStr && `Started ${startStr}`}
          {workingDaysIn !== null && ` · ${workingDaysIn} working days in`}
          {deadlineStr && ' · due '}
          {deadlineStr && (
            <span className={deadlineOverdue ? 'text-danger' : projectSettled ? '' : 'text-foreground'}>
              {deadlineStr}{deadlineRel && ` (${deadlineRel})`}
            </span>
          )}
          {!startStr && !deadlineStr && 'No dates set'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: objectives + tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Objectives */}
          <div>
            <SectionHeader title="Objectives" meta={goals.length > 0 ? `${doneGoals} of ${goals.length} · ${goalPct}%` : undefined} />
            {goals.length > 0 && (
              <div className="h-[3px] bg-surface-sunken">
                <div className="h-full bg-primary transition-[width] duration-[var(--duration-standard)]" style={{ width: `${goalPct}%` }} />
              </div>
            )}
            <div className="py-3 space-y-3">
              {goals.length === 0 ? (
                <p className="text-ink-secondary text-[13px]">
                  {canEdit
                    ? 'No objectives yet. Add the milestones this project has to hit.'
                    : 'No objectives have been set for this project yet.'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {goals.map((goal) => {
                    const isEditing = editingGoalId === goal.id;
                    return (
                      <div key={goal.id} className="group flex items-center gap-3 py-2.5">
                        {canEdit ? (
                          <button type="button" onClick={() => toggleGoal(goal.id)} className="shrink-0 text-ink-faint hover:text-foreground transition-colors" aria-label={goal.completed ? 'Mark objective incomplete' : 'Mark objective complete'}>
                            {goal.completed ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4" />}
                          </button>
                        ) : (
                          <span className="shrink-0 text-ink-faint">
                            {goal.completed ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4" />}
                          </span>
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={() => handleSaveEdit(goal.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(goal.id); if (e.key === 'Escape') setEditingGoalId(null); }}
                            autoFocus
                            className="flex-1 bg-transparent border-none text-[13px] text-foreground focus:outline-none p-0"
                          />
                        ) : (
                          <span
                            onDoubleClick={canEdit ? () => { setEditingGoalId(goal.id); setEditingText(goal.text); } : undefined}
                            className={`flex-1 text-[13px] select-none truncate ${canEdit ? 'cursor-text' : ''} ${goal.completed ? 'line-through text-ink-faint' : 'text-foreground'}`}
                            title={canEdit ? 'Double-click to edit' : undefined}
                          >
                            {goal.text}
                          </span>
                        )}
                        {canEdit && (
                          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setEditingGoalId(goal.id); setEditingText(goal.text); }} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" aria-label="Edit objective">
                              <span className="text-[11px] font-medium px-1">Edit</span>
                            </button>
                            <button type="button" onClick={() => deleteGoal(goal.id)} className="p-1 text-ink-faint hover:text-danger rounded-[3px] hover:bg-danger-soft transition-colors" aria-label="Delete objective">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit && (
                <form onSubmit={handleAddGoal} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newGoalText}
                    onChange={(e) => setNewGoalText(e.target.value)}
                    placeholder="Add an objective…"
                    aria-label="New objective"
                    className="flex-1 bg-surface-raised border border-border rounded-md px-3 py-1.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                  <button type="submit" className="px-3 py-1.5 border border-border-strong text-ink-secondary hover:text-foreground hover:bg-surface-sunken text-xs font-semibold rounded-md transition-colors flex items-center gap-1 shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Tasks */}
          <div>
            <SectionHeader
              title="Tasks"
              meta={
                <>
                  {inProgTasks > 0 && `${inProgTasks} in progress`}{inProgTasks > 0 && todoTasks > 0 && ' · '}{todoTasks > 0 && `${todoTasks} to do`}
                  {inProgTasks === 0 && todoTasks === 0 && `${(project.tasks || []).length} total`}
                </>
              }
            />
            {!project.tasks || project.tasks.length === 0 ? (
              <p className="py-6 text-ink-secondary text-[14px]">
                No tasks on this project yet.{canEdit && <> <Link href="/tasks" className="text-primary hover:text-primary-hover">Add one</Link>.</>}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {[...project.tasks]
                  .sort((x, y) => Number(x.status === 'COMPLETED') - Number(y.status === 'COMPLETED'))
                  .filter((t) => showDone || t.status !== 'COMPLETED')
                  .map((task) => {
                  const isCompleted = task.status === 'COMPLETED';
                  const isInProgress = task.status === 'IN_PROGRESS';
                  const isBlocked = task.status === 'BLOCKED';
                  const marker = isCompleted
                    ? <CheckCircle2 className="w-4 h-4 text-primary" />
                    : isBlocked
                      ? <Ban className="w-4 h-4 text-[var(--color-data-slate)]" />
                      : <Circle className="w-4 h-4" />;
                  return (
                    <div key={task.id} className="group flex items-center gap-3 py-2.5">
                      {canEdit && !isBlocked ? (
                        <button onClick={() => toggleTaskStatus(task)} className="shrink-0 text-ink-faint hover:text-foreground transition-colors" aria-label={isCompleted ? 'Mark task incomplete' : 'Mark task complete'}>
                          {marker}
                        </button>
                      ) : (
                        <span className="shrink-0 text-ink-faint" title={isBlocked ? 'Blocked' : undefined}>{marker}</span>
                      )}
                      <span className={`flex-1 min-w-0 text-[14px] truncate ${isCompleted ? 'line-through text-ink-faint' : 'text-foreground font-medium'}`}>
                        {task.name}
                      </span>
                      {isBlocked && (task.blockedOnName || task.blockedReason) && (
                        <span className="hidden sm:inline text-[10px] text-[var(--color-data-slate)] truncate max-w-[12rem] shrink-0" title={task.blockedReason || undefined}>
                          waiting on {task.blockedOnName || task.blockedReason}
                        </span>
                      )}
                      {project.teamId && (task.ownerName || task.ownerEmail) && (
                        <span className="hidden sm:inline text-[10px] text-ink-secondary border border-border px-1.5 py-0.5 rounded-[3px] shrink-0">
                          {task.ownerName || task.ownerEmail}
                        </span>
                      )}
                      {canEdit && !isCompleted && (
                        <button
                          onClick={() => setBlockingTask(task)}
                          className={`hidden group-hover:inline-flex p-1 rounded-[3px] hover:bg-surface-sunken transition-colors shrink-0 ${isBlocked ? 'text-[var(--color-data-slate)]' : 'text-ink-faint hover:text-foreground'}`}
                          title={isBlocked ? 'Edit block' : 'Mark blocked'}
                          aria-label={isBlocked ? 'Edit block' : 'Mark blocked'}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className={`text-[13px] tabular-nums shrink-0 ${isInProgress ? 'text-primary' : 'text-ink-faint'}`}>
                        {isInProgress ? 'In progress' : isBlocked ? 'Blocked' : `${task.estimatedTime}h`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {(project.tasks || []).some((t) => t.status === 'COMPLETED') && (
              <button type="button" onClick={() => setShowDone((v) => !v)} className="mt-3 text-[13.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
                {showDone ? 'Hide completed tasks' : `Show ${(project.tasks || []).filter((t) => t.status === 'COMPLETED').length} completed`}
              </button>
            )}
          </div>
        </div>

        {/* Right: Pulse */}
        <div>
          <div>
            <SectionHeader title="Summary" />
            <div className="pt-4 space-y-6">
              {/* Time invested */}
              <div>
                <p className="text-[13px] text-ink-secondary mb-2">Time spent</p>
                <p className="font-serif text-[26px] font-medium leading-none text-foreground tabular-nums">
                  {project.timeSpent}h <span className="font-sans text-[13px] text-ink-faint">of ~{estTotalH}h estimated</span>
                </p>
                <div className="h-[3px] bg-surface-sunken rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${timePct}%` }} />
                </div>
              </div>

              {/* Progress - explicitly "Task Progress" (not "Progress") so it
                  doesn't read as a duplicate of the Objectives checklist's
                  own percentage above; the two track different things and
                  can legitimately disagree (e.g. every objective done but
                  clean-up tasks still open, or vice versa). */}
              <div>
                <p className="text-[13px] text-ink-secondary mb-2">Task progress</p>
                <p className="font-serif text-[26px] font-medium leading-none text-foreground tabular-nums">
                  {project.tasksCompleted} <span className="font-sans text-[13px] text-ink-faint">of {project.tasksCompleted + project.tasksRemaining} tasks · {project.progress}%</span>
                </p>
                <div className="h-[3px] bg-surface-sunken rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${project.progress}%` }} />
                </div>
              </div>

              {/* Linked */}
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-[11.5px] font-semibold text-ink-faint">Notebook</p>
                <button
                  type="button"
                  onClick={handleOpenNotebook}
                  disabled={openingNotebook}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-surface-raised hover:bg-surface-sunken border border-border-strong rounded-md text-[13px] font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    {openingNotebook
                      ? 'Opening…'
                      : (project.linkedNotebooks?.length || 0) > 1
                        ? 'View notebooks'
                        : 'Open notebook'}
                  </span>
                  {(project.linkedNotebooks?.length || 0) > 1 ? (
                    <span className="text-[12.5px] text-ink-faint">
                      {project.linkedNotebooks!.length} notebooks
                    </span>
                  ) : project.linkedNotebooks?.[0]?.updatedAt ? (
                    <span className="text-[12.5px] text-ink-faint">
                      Updated {new Date(project.linkedNotebooks[0].updatedAt as string).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  ) : null}
                </button>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-secondary">Next deadline</span>
                  <span className={`text-[12.5px] ${deadlineOverdue && project.status !== 'COMPLETED' ? 'text-danger' : 'text-ink-faint'}`}>
                    {deadlineStr ? (deadlineRel ? `${deadlineStr} · ${deadlineRel}` : deadlineStr) : '–'}
                  </span>
                </div>
              </div>

              {/* People — team projects only */}
              {project.teamId && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11.5px] font-semibold text-ink-faint">People</p>
                    {project.canEdit && (
                      <button type="button" onClick={openAddCollaborator} className="p-0.5 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" aria-label="Add collaborator" title="Add collaborator">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {collaborators.length === 0 ? (
                    <p className="text-[13px] text-ink-faint">Everyone with team access can work here.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {collaborators.map((c) => (
                        <div key={c.userId} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="text-ink-secondary truncate">{c.name || c.email}</span>
                          {project.canEdit && (
                            <button type="button" onClick={() => handleRemoveCollaborator(c.userId)} className="text-ink-faint hover:text-danger shrink-0" aria-label="Remove collaborator">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {showAddCollaborator && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                      {addableMembers.length === 0 ? (
                        <p className="text-[13px] text-ink-faint">No more team members to add.</p>
                      ) : (
                        addableMembers.map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            disabled={addingCollaborator}
                            onClick={() => handleAddCollaborator(m.userId)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-surface-raised hover:bg-surface-sunken rounded-md text-[13px] text-foreground text-left disabled:opacity-50 transition-colors"
                          >
                            {m.name || m.email}
                            <Plus className="w-3.5 h-3.5 text-ink-faint" />
                          </button>
                        ))
                      )}
                      <button type="button" onClick={() => setShowAddCollaborator(false)} className="text-[11px] text-ink-faint hover:text-foreground font-medium">
                        Close
                      </button>
                    </div>
                  )}

                  {project.canEdit && (
                    <label className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-[12px] text-ink-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!project.visibleToSubgroup}
                        onChange={(e) => toggleSubgroupVisibility(e.target.checked)}
                        className="mt-0.5 rounded-[3px] border-border-strong text-primary focus:ring-ring"
                      />
                      <span>
                        Visible to team leaders whose group works on this
                        <span className="block text-[11px] text-ink-faint">Read-only. Only leaders who have someone from their group on the project.</span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>

          {project.teamId && user?.id && (
            <ObjectChat
              teamId={project.teamId}
              objectType="project"
              objectId={project.id}
              currentUserId={user.id}
              className="mt-6"
            />
          )}
        </div>
      </div>

      {blockingTask && (
        <BlockTaskDialog
          task={blockingTask}
          onClose={() => setBlockingTask(null)}
          onSaved={() => setRefreshTrigger(prev => prev + 1)}
        />
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
