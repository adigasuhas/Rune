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
  Pencil,
  ChevronLeft,
  X as XIcon
} from 'lucide-react';
import { SectionHeader } from '@/components/ui';
import { ProjectBackups } from '@/components/backups/BackupPanels';
import { formatHoursValue } from '@/lib/numberFormat';

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
  // The moment the page opened - for how far through its dates the project is.
  const [now] = useState(() => Date.now());

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
  const tasks = project.tasks || [];
  const settled = project.status === 'COMPLETED' || project.status === 'ARCHIVED';
  const start = project.startDate ? new Date(project.startDate) : null;
  const due = project.deadline ? new Date(project.deadline) : null;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) });
  const dueRel = settled ? null : formatRelativeDeadline(project.deadline);
  const overdue = !!dueRel && dueRel.includes('overdue');
  const timeline = start && due ? `${fmtDate(start)} – ${fmtDate(due)}` : due ? `Due ${fmtDate(due)}` : start ? `From ${fmtDate(start)}` : null;
  // How far through its dates the project is - drawn, not written out.
  const elapsedPct = start && due && due > start && !settled
    ? Math.min(100, Math.max(0, ((now - start.getTime()) / (due.getTime() - start.getTime())) * 100))
    : null;
  const workingDaysIn = start ? Math.max(0, Math.round(((now - start.getTime()) / 86400000) * (5 / 7))) : null;

  const doneGoals = goals.filter(g => g.completed).length;
  const goalPct = goals.length > 0 ? Math.round((doneGoals / goals.length) * 100) : 0;
  const totalTasks = project.tasksCompleted + project.tasksRemaining;
  const plannedH = project.timeSpent + project.estimatedTimeRemaining;
  const timePct = plannedH > 0 ? Math.min(100, (project.timeSpent / plannedH) * 100) : 0;
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const notebookCount = project.linkedNotebooks?.length || 0;
  const hasAside = canEdit || !!project.teamId;

  const status = STATUS[project.status] || { label: project.status, dot: 'bg-border-strong' };
  const priority = PRIORITY[project.priority || 'MEDIUM'] || PRIORITY.MEDIUM;

  const actionClass = 'flex h-9 items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface px-3.5 text-[14px] font-semibold text-foreground transition-colors hover:bg-surface-raised disabled:opacity-50';

  return (
    <div>
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Back to the list; the project's own name is the title just below. */}
        <Link href="/projects" className="-ml-1 inline-flex items-center gap-0.5 rounded-[6px] py-1 pl-0.5 pr-1.5 text-[13.5px] text-ink-faint transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Projects
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleOpenNotebook} disabled={openingNotebook} className={actionClass}>
            <BookOpen className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            {openingNotebook ? 'Opening…' : notebookCount > 1 ? `${notebookCount} notebooks` : 'Notebook'}
          </button>
          <Link href={`/wall?projectId=${project.id}`} className={actionClass}>
            <StickyNote className="h-4 w-4 text-ink-faint" aria-hidden="true" /> Wall
          </Link>
          {canEdit && (
            <Link
              href="/tasks"
              className="flex h-9 items-center gap-1.5 rounded-[9px] bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New task
            </Link>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || 'var(--border-strong)' }} aria-hidden="true" />
          <h1 className="app-title text-foreground">{project.name}</h1>
          {!canEdit && (
            <span className="flex items-center gap-1 text-[13px] text-ink-faint">
              <Eye className="h-3 w-3" aria-hidden="true" /> View only
            </span>
          )}
        </div>
        {project.description && project.description !== 'Demo project' && (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-secondary">{project.description}</p>
        )}
      </div>

      {/* The project at a glance: one ruled row of facts, each said once. */}
      <dl aria-label="Project details" className="mt-6 grid grid-cols-2 gap-x-6 border-b border-border lg:grid-cols-6 lg:gap-x-0 lg:border-t">
        <Fact label="Status">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
        </Fact>
        <Fact label="Priority">
          <span className={priority.cls}>{priority.label}</span>
        </Fact>
        <Fact
          label="Timeline"
          className="col-span-2"
          meter={elapsedPct !== null ? <Meter pct={elapsedPct} tone={overdue ? 'bg-danger' : 'bg-ink-faint'} /> : undefined}
          title={workingDaysIn !== null && !settled ? `${workingDaysIn} working days in` : undefined}
        >
          {timeline ? (
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate">{timeline}</span>
              {dueRel && <span className={`shrink-0 text-[12.5px] font-normal ${overdue ? 'text-danger' : 'text-ink-faint'}`}>{dueRel}</span>}
            </span>
          ) : (
            <span className="font-normal text-ink-faint">No dates set</span>
          )}
        </Fact>
        <Fact label="Tasks done" meter={totalTasks > 0 ? <Meter pct={project.progress} /> : undefined}>
          {totalTasks > 0 ? (
            <>{project.tasksCompleted}<span className="font-normal text-ink-faint"> of {totalTasks}</span></>
          ) : (
            <span className="font-normal text-ink-faint">None yet</span>
          )}
        </Fact>
        <Fact label="Hours" meter={plannedH > 0 ? <Meter pct={timePct} /> : undefined}>
          {plannedH > 0 ? (
            <>{formatHoursValue(project.timeSpent)}<span className="font-normal text-ink-faint"> of {formatHoursValue(plannedH)}</span></>
          ) : (
            <span className="font-normal text-ink-faint">None yet</span>
          )}
        </Fact>
      </dl>

      <div className={`mt-10 grid grid-cols-1 gap-x-12 gap-y-10 ${hasAside ? 'lg:grid-cols-3' : 'max-w-3xl'}`}>
        <div className="space-y-10 lg:col-span-2">
          {/* Objectives */}
          <section>
            <SectionHeader title="Objectives" meta={goals.length > 0 ? `${doneGoals} of ${goals.length}` : undefined} />
            {goals.length > 0 && (
              <div className="h-[3px] bg-surface-sunken" aria-hidden="true">
                <div className="h-full bg-primary transition-[width] duration-[var(--duration-standard)]" style={{ width: `${goalPct}%` }} />
              </div>
            )}
            {goals.length === 0 && !canEdit && (
              <p className="py-4 text-[13.5px] text-ink-secondary">No objectives set.</p>
            )}
            {goals.length > 0 && (
              <ul className="divide-y divide-border">
                {goals.map((goal) => {
                  const isEditing = editingGoalId === goal.id;
                  const mark = goal.completed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />;
                  return (
                    <li key={goal.id} className="group flex min-h-[44px] items-center gap-3 py-2">
                      {canEdit ? (
                        <button type="button" onClick={() => toggleGoal(goal.id)} className="shrink-0 text-ink-faint transition-colors hover:text-foreground" aria-label={goal.completed ? 'Mark objective incomplete' : 'Mark objective complete'}>
                          {mark}
                        </button>
                      ) : (
                        <span className="shrink-0 text-ink-faint">{mark}</span>
                      )}
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() => handleSaveEdit(goal.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(goal.id); if (e.key === 'Escape') setEditingGoalId(null); }}
                          autoFocus
                          aria-label="Objective"
                          className="flex-1 border-none bg-transparent p-0 text-[14px] text-foreground focus:outline-none"
                        />
                      ) : (
                        <span
                          onDoubleClick={canEdit ? () => { setEditingGoalId(goal.id); setEditingText(goal.text); } : undefined}
                          className={`flex-1 truncate text-[14px] ${canEdit ? 'cursor-text' : ''} ${goal.completed ? 'text-ink-faint line-through' : 'text-foreground'}`}
                        >
                          {goal.text}
                        </span>
                      )}
                      {canEdit && !isEditing && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button type="button" onClick={() => { setEditingGoalId(goal.id); setEditingText(goal.text); }} className="rounded-[4px] p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground" aria-label="Edit objective">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => deleteGoal(goal.id)} className="rounded-[4px] p-1.5 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger" aria-label="Delete objective">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && (
              <form
                onSubmit={handleAddGoal}
                className={`-mx-2 flex min-h-[44px] items-center gap-3 rounded-[8px] px-2 transition-colors focus-within:bg-surface-raised ${goals.length > 0 ? 'mt-1' : 'mt-2'}`}
              >
                <Plus className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <input
                  type="text"
                  value={newGoalText}
                  onChange={(e) => setNewGoalText(e.target.value)}
                  placeholder="Add an objective"
                  aria-label="New objective"
                  className="flex-1 border-0 bg-transparent p-0 text-[14px] text-foreground placeholder-ink-faint shadow-none outline-none ring-0 focus:outline-none focus:ring-0"
                />
                {newGoalText.trim() && (
                  <button type="submit" className="shrink-0 text-[13px] font-semibold text-primary hover:text-primary-hover">
                    Add
                  </button>
                )}
              </form>
            )}
          </section>

          {/* Tasks */}
          <section>
            <SectionHeader title="Tasks" />
            {tasks.length === 0 ? (
              <p className="py-4 text-[13.5px] text-ink-secondary">No tasks on this project yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...tasks]
                  .sort((x, y) => Number(x.status === 'COMPLETED') - Number(y.status === 'COMPLETED'))
                  .filter((t) => showDone || t.status !== 'COMPLETED')
                  .map((task) => {
                    const isCompleted = task.status === 'COMPLETED';
                    const isInProgress = task.status === 'IN_PROGRESS';
                    const isBlocked = task.status === 'BLOCKED';
                    const marker = isCompleted
                      ? <CheckCircle2 className="h-4 w-4 text-primary" />
                      : isBlocked
                        ? <Ban className="h-4 w-4 text-[var(--color-data-slate)]" />
                        : <Circle className="h-4 w-4" />;
                    const waitingOn = task.blockedOnName || task.blockedReason;
                    const owner = project.teamId ? task.ownerName || task.ownerEmail : null;
                    return (
                      <li key={task.id} className="group flex min-h-[44px] items-center gap-3 py-2">
                        {canEdit && !isBlocked ? (
                          <button onClick={() => toggleTaskStatus(task)} className="shrink-0 text-ink-faint transition-colors hover:text-foreground" aria-label={isCompleted ? 'Mark task incomplete' : 'Mark task complete'}>
                            {marker}
                          </button>
                        ) : (
                          <span className="shrink-0 text-ink-faint" title={isBlocked ? 'Blocked' : undefined}>{marker}</span>
                        )}
                        <span className={`min-w-0 flex-1 truncate text-[14px] ${isCompleted ? 'text-ink-faint line-through' : 'font-medium text-foreground'}`}>
                          {task.name}
                        </span>
                        {owner && (
                          <span className="hidden max-w-[10rem] shrink-0 truncate text-[12px] text-ink-faint sm:inline">{owner}</span>
                        )}
                        {canEdit && !isCompleted && (
                          <button
                            onClick={() => setBlockingTask(task)}
                            className={`shrink-0 rounded-[4px] p-1.5 opacity-0 transition-[opacity,colors] hover:bg-surface-sunken focus-visible:opacity-100 group-hover:opacity-100 ${isBlocked ? 'text-[var(--color-data-slate)]' : 'text-ink-faint hover:text-foreground'}`}
                            title={isBlocked ? 'Edit block' : 'Mark blocked'}
                            aria-label={isBlocked ? 'Edit block' : 'Mark blocked'}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span
                          className={`max-w-[8.5rem] shrink-0 truncate text-right sm:max-w-[14rem] text-[13px] tabular-nums ${isInProgress ? 'font-medium text-primary' : isBlocked ? 'text-ink-secondary' : 'text-ink-faint'}`}
                          title={isBlocked && task.blockedReason ? task.blockedReason : undefined}
                        >
                          {isInProgress
                            ? 'In progress'
                            : isBlocked
                              ? waitingOn ? `Waiting on ${waitingOn}` : 'Blocked'
                              : task.estimatedTime > 0 ? formatHoursValue(task.estimatedTime) : ''}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
            {completedCount > 0 && (
              <button type="button" onClick={() => setShowDone((v) => !v)} className="mt-3 text-[13.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
                {showDone ? 'Hide completed' : `Show ${completedCount} completed`}
              </button>
            )}
          </section>
        </div>

        {hasAside && (
          <aside className="space-y-10">
            {canEdit && <ProjectBackups projectId={project.id} />}

            {/* People - team projects only */}
            {project.teamId && (
              <section>
                <SectionHeader
                  title="People"
                  right={project.canEdit ? (
                    <button type="button" onClick={openAddCollaborator} className="rounded-[4px] p-1 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-foreground" aria-label="Add collaborator" title="Add collaborator">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  ) : undefined}
                />
                <div className="pt-3">
                  {collaborators.length === 0 ? (
                    <p className="text-[13px] text-ink-faint">Everyone on the team can work here.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {collaborators.map((c) => (
                        <li key={c.userId} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="truncate text-ink-secondary">{c.name || c.email}</span>
                          {project.canEdit && (
                            <button type="button" onClick={() => handleRemoveCollaborator(c.userId)} className="shrink-0 text-ink-faint hover:text-danger" aria-label="Remove collaborator">
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showAddCollaborator && (
                    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {addableMembers.length === 0 ? (
                        <p className="text-[13px] text-ink-faint">No more team members to add.</p>
                      ) : (
                        addableMembers.map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            disabled={addingCollaborator}
                            onClick={() => handleAddCollaborator(m.userId)}
                            className="flex w-full items-center justify-between rounded-md bg-surface-raised px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-sunken disabled:opacity-50"
                          >
                            {m.name || m.email}
                            <Plus className="h-3.5 w-3.5 text-ink-faint" />
                          </button>
                        ))
                      )}
                      <button type="button" onClick={() => setShowAddCollaborator(false)} className="text-[12px] font-medium text-ink-faint hover:text-foreground">
                        Close
                      </button>
                    </div>
                  )}
                  {project.canEdit && (
                    <label className="mt-4 flex cursor-pointer items-start gap-2 text-[12.5px] leading-snug text-ink-secondary">
                      <input
                        type="checkbox"
                        checked={!!project.visibleToSubgroup}
                        onChange={(e) => toggleSubgroupVisibility(e.target.checked)}
                        className="mt-0.5 rounded-[3px] border-border-strong text-primary focus:ring-ring"
                      />
                      Leaders of groups on this project can view it (read-only)
                    </label>
                  )}
                </div>
              </section>
            )}

            {project.teamId && user?.id && (
              <ObjectChat
                teamId={project.teamId}
                objectType="project"
                objectId={project.id}
                currentUserId={user.id}
              />
            )}
          </aside>
        )}
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

const STATUS: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-primary' },
  ON_HOLD: { label: 'On hold', dot: 'bg-warning' },
  COMPLETED: { label: 'Completed', dot: 'bg-ink-secondary' },
  ARCHIVED: { label: 'Archived', dot: 'bg-border-strong' },
};

const PRIORITY: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: 'Critical', cls: 'text-danger' },
  HIGH: { label: 'High', cls: 'text-warning' },
  MEDIUM: { label: 'Medium', cls: '' },
  LOW: { label: 'Low', cls: 'text-ink-secondary' },
};

/** One cell of the facts row: a small label over its value, and an optional meter. */
function Fact({ label, children, meter, className = '', title }: { label: string; children: React.ReactNode; meter?: React.ReactNode; className?: string; title?: string }) {
  return (
    <div
      title={title}
      className={`min-w-0 border-t border-border py-3.5 lg:border-t-0 lg:px-5 lg:first:pl-0 lg:last:pr-0 lg:[&:not(:first-child)]:border-l ${className}`}
    >
      <dt className="text-[11.5px] font-medium text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[15px] font-medium tabular-nums text-foreground">{children}</dd>
      {meter}
    </div>
  );
}

function Meter({ pct, tone = 'bg-primary' }: { pct: number; tone?: string }) {
  return (
    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export const dynamic = 'force-dynamic';
