'use client';

import React, { useState, useEffect } from 'react';
import { LoadError } from '@/components/LoadError';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Archive,
  Edit3,
  RefreshCw,
  CheckCircle,

  Users
} from 'lucide-react';
import { PROJECT_COLORS } from '@/lib/colors';
import { useConfirm } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { getLocalDateString } from '@/lib/dateUtils';
import { useSession } from '@/context/SessionContext';
import { useSpotlightCards } from '@/hooks/useSpotlightCards';
import { Button, EmptyState, PageHeader, SectionHeader } from '@/components/ui';

interface Goal {
  id: string;
  text: string;
  completed: boolean;
}

/**
 * Objective templates for common research projects. The first objective is
 * pre-checked on purpose: endowed progress (Nunes & Drèze 2006) - a checklist
 * you're already 1/N into gets finished more often than one at zero. It maps
 * to a step you've genuinely done by the time you're creating the project
 * (you have picked the question / the paper / the corpus).
 */
const PROJECT_TEMPLATES: { name: string; description: string; objectives: string[] }[] = [
  {
    name: 'Paper',
    description: 'From framing to submission.',
    objectives: ['Settle the central claim', 'Assemble the figures', 'Draft methods and results', 'Write the introduction and discussion', 'Internal review', 'Submit']
  },
  {
    name: 'Experiment campaign',
    description: 'A planned series of runs toward one result.',
    objectives: ['Define the hypothesis and success criterion', 'Pilot run and lock the protocol', 'Full run series', 'Analysis pipeline', 'Write up in the notebook']
  },
  {
    name: 'Literature review',
    description: 'Map a subfield.',
    objectives: ['Set the scope and search terms', 'First-pass triage', 'Read the core papers in depth', 'Synthesize and find gaps', 'Draft the review']
  },
  {
    name: 'Method or tool build',
    description: 'Build something reusable.',
    objectives: ['Specify the interface and requirements', 'Prototype', 'Validate against a known case', 'Document and package', 'Hand off or release']
  }
];

interface Project {
  id: string;
  name: string;
  description: string;
  goals: string;
  startDate?: string;
  deadline?: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  progress: number;
  tasksCompleted: number;
  tasksRemaining: number;
  timeSpent: number;
  estimatedTimeRemaining: number;
  color: string;
  createdAt?: string;
  teamId?: string | null;
}

interface TeamOption {
  id: string;
  name: string;
  myRole: 'OWNER' | 'TEAM_LEADER' | 'MEMBER';
}

interface TeamMemberOption {
  userId: string;
  name: string | null;
  email: string;
}

export default function ProjectsPage() {
  const { user } = useSession();
  const confirm = useConfirm();
  useSpotlightCards();
  const [projects, setProjects] = useState<Project[]>([]);
  const [now] = useState(() => Date.now());
  // Tasks, so each project can show what's actually open in it and what's next.
  const [tasks, setTasks] = useState<{ id: string; name: string; projectId?: string | null; status: string; date: string; priority: string }[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'>('ACTIVE');
  const [selectedColorFilter, setSelectedColorFilter] = useState<string>('ALL');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userTimezone, setUserTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  });

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form States
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projDeadline, setProjDeadline] = useState('');
  const [projStatus, setProjStatus] = useState<'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'>('ACTIVE');
  const [projPriority, setProjPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [projColor, setProjColor] = useState('var(--border-strong)');
  const [createNotebook, setCreateNotebook] = useState(true);

  // Team workspace picker - only settable at creation time (see
  // /api/projects POST: teamId is create-only, not part of PUT).
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [projTeamId, setProjTeamId] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  const [projCollaboratorIds, setProjCollaboratorIds] = useState<string[]>([]);

  // Goals Checklist States
  const [projGoalsList, setProjGoalsList] = useState<Goal[]>([]);
  const [newGoalText, setNewGoalText] = useState('');

  // Helper to parse JSON goals string
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
          text: line,
          completed: false
        }));
    }
    return [];
  };

  const [dataLoading, setDataLoading] = useState(true);

  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectsRes, settingsRes, teamsRes, tasksRes] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/settings'),
          fetch('/api/teams'),
          fetch('/api/tasks'),
        ]);
        setLoadFailed(![projectsRes, tasksRes].every((r) => r.ok));
        if (projectsRes.ok) setProjects(await projectsRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          if (s.timezone) setUserTimezone(s.timezone);
        }
        if (teamsRes.ok) {
          const allTeams: TeamOption[] = await teamsRes.json();
          // Members can work within team projects they're added to, but
          // can't create new ones - only show teams where creation is allowed.
          setTeamOptions(allTeams.filter((t) => t.myRole === 'OWNER' || t.myRole === 'TEAM_LEADER'));
        }
      } catch (err) {
        setLoadFailed(true);
        console.error(err);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [refreshTrigger]);

  const openCreateModal = () => {
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    setProjDeadline('');
    setProjStatus('ACTIVE');
    setProjPriority('MEDIUM');
    setProjColor('var(--border-strong)');
    setCreateNotebook(true);
    setProjGoalsList([]);
    setNewGoalText('');
    setProjTeamId('');
    setTeamMembers([]);
    setProjCollaboratorIds([]);
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setProjName(project.name);
    setProjDesc(project.description || '');
    setProjDeadline(project.deadline ? getLocalDateString(project.deadline, userTimezone) : '');
    setProjStatus(project.status);
    setProjPriority(project.priority || 'MEDIUM');
    setProjColor(project.color || 'var(--border-strong)');
    setProjGoalsList(parseGoals(project.goals));
    setNewGoalText('');
    setIsModalOpen(true);
  };

  const handleSelectTeam = async (teamId: string) => {
    setProjTeamId(teamId);
    setProjCollaboratorIds([]);
    if (!teamId) {
      setTeamMembers([]);
      return;
    }
    setLoadingTeamMembers(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (res.ok) {
        const data: { members: (TeamMemberOption & { role: string })[] } = await res.json();
        // Owner and self already have full access regardless of an
        // explicit collaborator grant - only offer everyone else here.
        const members = (data.members || []).filter(
          (m) => m.role !== 'OWNER' && m.userId !== user?.id
        );
        setTeamMembers(members);
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setLoadingTeamMembers(false);
    }
  };

  const toggleCollaborator = (userId: string) => {
    setProjCollaboratorIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddGoalInModal = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const newGoal: Goal = {
      id: Math.random().toString(36).substring(2, 9),
      text: newGoalText.trim(),
      completed: false
    };
    setProjGoalsList(prev => [...prev, newGoal]);
    setNewGoalText('');
  };

  const handleDeleteGoalInModal = (goalId: string) => {
    setProjGoalsList(prev => prev.filter(g => g.id !== goalId));
  };

  const handleToggleGoalInModal = (goalId: string) => {
    setProjGoalsList(prev => prev.map(g => g.id === goalId ? { ...g, completed: !g.completed } : g));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName) return;

    const body = {
      name: projName,
      description: projDesc,
      goals: JSON.stringify(projGoalsList),
      deadline: projDeadline ? new Date(projDeadline).toISOString() : undefined,
      status: projStatus,
      priority: projPriority,
      color: projColor,
      createNotebook: !editingProject ? createNotebook : undefined,
      teamId: !editingProject && projTeamId ? projTeamId : undefined,
      collaboratorUserIds: !editingProject && projTeamId ? projCollaboratorIds : undefined
    };

    try {
      let res;
      if (editingProject) {
        res = await fetch(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }

      if (res.ok) {
        setIsModalOpen(false);
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (projectId: string, status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED') => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!(await confirm({ title: 'Delete this project?', message: 'This permanently deletes the project and all of its tasks. You can’t undo this.', confirmLabel: 'Delete project', danger: true }))) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredProjects = projects
    .filter(p => {
      if (filter === 'ALL') return true;
      return p.status === filter;
    })
    .filter(p => {
      if (selectedColorFilter === 'ALL') return true;
      return p.color?.toLowerCase() === selectedColorFilter.toLowerCase();
    })
    .sort((a, b) => {
      // 1. Priority (Critical > High > Medium > Low)
      const weights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const weightA = weights[a.priority] || 2;
      const weightB = weights[b.priority] || 2;
      if (weightA !== weightB) return weightB - weightA;

      // 2. Deadline (earliest first, empty last)
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;

      // 3. Creation Date (newest first)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

  if (dataLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex justify-between items-center gap-4">
          <div className="h-9 w-56 bg-surface-raised rounded-[var(--radius-md)]" />
          <div className="h-10 w-32 bg-surface-raised rounded-[var(--radius-md)]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 bg-surface-raised rounded-[var(--radius-lg)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {(() => {
        const DAY = 86_400_000;
        const daysLeft = (p: Project) => (p.deadline ? Math.ceil((new Date(p.deadline).getTime() - now) / DAY) : null);
        const goalsOf = (p: Project) => { const g = parseGoals(p.goals); return { done: g.filter(x => x.completed).length, total: g.length }; };
        const taskStats = (p: Project) => {
          const mine = tasks.filter(t => t.projectId === p.id);
          const open = mine.filter(t => t.status !== 'COMPLETED');
          const next = [...open].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())[0];
          return { open: open.length, done: mine.length - open.length, next };
        };
        const pctOf = (p: Project) => {
          const g = goalsOf(p);
          if (g.total) return Math.round((g.done / g.total) * 100);
          const t = taskStats(p);
          if (t.open + t.done) return Math.round((t.done / (t.open + t.done)) * 100);
          return Math.round(p.progress || 0);
        };
        const active = projects.filter(p => p.status === 'ACTIVE');
        // "Needs attention": overdue, or due within three weeks with less than
        // two-thirds done. Plain rules, so the list is explainable.
        const attention = active.filter(p => { const d = daysLeft(p); return d != null && (d < 0 || (d <= 21 && pctOf(p) < 67)); });
        const upcoming = active.filter(p => { const d = daysLeft(p); return d != null && d >= 0 && d <= 90; }).sort((x, y) => (daysLeft(x)! - daysLeft(y)!));
        const nextDue = upcoming[0];
        const counts = { ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, ARCHIVED: 0, ALL: projects.length } as Record<string, number>;
        projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
        const when = (d: number | null) => d == null ? 'No deadline' : d < 0 ? `${-d} ${d === -1 ? 'day' : 'days'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : d < 60 ? `In ${d} days` : `In ${Math.round(d / 30)} months`;

        return (
          <>
            <PageHeader
              className=""
              title="Projects"
              subtitle={
                projects.length === 0 ? 'Group related work: a paper, a thesis chapter, an experiment campaign.' :
                `${counts.ACTIVE} active${attention.length ? ` · ${attention.length} ${attention.length === 1 ? 'needs' : 'need'} attention` : ''}${nextDue ? ` · next deadline ${when(daysLeft(nextDue)).toLowerCase()}` : ''}`
              }
              actions={<Button onClick={openCreateModal}><Plus className="w-4 h-4" /> New project</Button>}
            />
            {loadFailed && <LoadError what="your projects" onRetry={() => setRefreshTrigger((n) => n + 1)} />}

            {/* The next 90 days, with each active project's deadline on it */}
            {upcoming.length > 0 && (
              <section aria-label="Upcoming deadlines">
                <div className="relative h-[74px]">
                  <div className="absolute inset-x-0 top-[38px] h-px bg-border-strong" />
                  {[0, 30, 60, 90].map((d) => (
                    <span key={d} className={`absolute top-[46px] whitespace-nowrap text-[11.5px] text-ink-faint ${d === 0 ? '' : d === 90 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(d / 90) * 100}%` }}>
                      {d === 0 ? 'Today' : `${d} days`}
                    </span>
                  ))}
                  {upcoming.map((p, i) => {
                    const d = daysLeft(p)!;
                    const left = Math.min(100, (d / 90) * 100);
                    return (
                      <Link key={p.id} href={`/projects/${p.id}`} className="group absolute -translate-x-1/2" style={{ left: `${left}%`, top: i % 2 ? 0 : 12 }} title={`${p.name} · ${when(d)}`}>
                        <span className="flex flex-col items-center">
                          <span className="max-w-[10rem] truncate rounded-[6px] px-1.5 text-[12px] font-medium text-ink-secondary group-hover:text-foreground">{p.name}</span>
                          <span className="mt-0.5 block w-px bg-border-strong" style={{ height: i % 2 ? 22 : 10 }} />
                          <span className="block h-2.5 w-2.5 rounded-full border-2 border-background" style={{ backgroundColor: p.color || 'var(--text-faint)' }} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {attention.length > 0 && (filter === 'ACTIVE' || filter === 'ALL') && (
              <section>
                <SectionHeader title={<span className="text-danger">Needs attention</span>} meta={attention.length} />
                <ul className="divide-y divide-border">
                  {attention.map((p) => {
                    const d = daysLeft(p)!;
                    return (
                      <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                        <Link href={`/projects/${p.id}`} className="text-[14.5px] font-medium hover:text-primary">{p.name}</Link>
                        <span className="text-[13.5px] text-ink-secondary">
                          <span className={d < 0 ? 'text-danger' : ''}>{when(d)}</span> · {pctOf(p)}% done · {taskStats(p).open} open {taskStats(p).open === 1 ? 'task' : 'tasks'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
                <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
                  {(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'ALL'] as const).map((tab) => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={filter === tab}
                      onClick={() => { setFilter(tab); setSelectedColorFilter('ALL'); }}
                      className={`-mb-px shrink-0 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${filter === tab ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'}`}
                    >
                      {tab === 'ALL' ? 'All' : tab === 'ON_HOLD' ? 'On hold' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                      <span className="ml-1.5 text-[12px] font-normal text-ink-faint tabular-nums">{counts[tab] || 0}</span>
                    </button>
                  ))}
                </div>
                {projects.length > 1 && (
                  <div className="flex items-center gap-1 pb-2" role="group" aria-label="Filter by colour">
                    {PROJECT_COLORS.filter(col => projects.some(p => p.color?.toLowerCase() === col.value.toLowerCase())).map((col) => {
                      const on = selectedColorFilter.toLowerCase() === col.value.toLowerCase();
                      return (
                        <button
                          key={col.value}
                          onClick={() => setSelectedColorFilter(on ? 'ALL' : col.value)}
                          title={`${col.name}${on ? ' (clear)' : ''}`}
                          aria-pressed={on}
                          aria-label={`Only ${col.name} projects`}
                          className={`grid h-7 w-7 place-items-center rounded-[7px] transition-colors ${on ? 'bg-surface shadow-[0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-sunken'}`}
                        >
                          <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: col.value }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {filteredProjects.length === 0 ? (
                loadFailed ? null : projects.length === 0 ? (
                  <EmptyState
                    spot="projects"
                    title="No projects yet"
                    message="A project holds everything for one piece of work: its tasks, notebook, runs and a wall for loose ideas."
                    action={<Button onClick={openCreateModal}><Plus className="w-4 h-4" /> New project</Button>}
                  />
                ) : (
                  <EmptyState compact spot="search" title="Nothing in this view" message="Try another status or colour." action={<Button variant="ghost" onClick={() => { setFilter('ALL'); setSelectedColorFilter('ALL'); }}>Show all projects</Button>} />
                )
              ) : (
                <ul className="divide-y divide-border">
                  {filteredProjects.map((project) => {
                    const g = goalsOf(project);
                    const pct = pctOf(project);
                    const ts = taskStats(project);
                    const d = daysLeft(project);
                    const late = d != null && d < 0 && project.status === 'ACTIVE';
                    return (
                      <li key={project.id} className="group grid grid-cols-1 gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: project.color || 'var(--border-strong)' }} aria-hidden="true" />
                            <Link href={`/projects/${project.id}`} className="truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground hover:text-primary">{project.name}</Link>
                            {project.status !== 'ACTIVE' && <span className="badge badge-neutral">{project.status === 'ON_HOLD' ? 'On hold' : project.status.charAt(0) + project.status.slice(1).toLowerCase()}</span>}
                            {(project.priority === 'CRITICAL' || project.priority === 'HIGH') && project.status === 'ACTIVE' && (
                              <span className={`text-[12.5px] font-medium ${project.priority === 'CRITICAL' ? 'text-danger' : 'text-warning'}`}>{project.priority === 'CRITICAL' ? 'Critical' : 'High priority'}</span>
                            )}
                            {project.teamId && <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-faint"><Users className="h-3 w-3" /> Team</span>}
                          </div>
                          <p className="mt-1 truncate pl-[22px] text-[13.5px] text-ink-secondary">
                            {ts.next ? <>Next: <span className="text-foreground">{ts.next.name}</span></> : project.description && project.description !== 'Demo project' ? project.description : ts.open === 0 ? 'No open tasks.' : ''}
                          </p>
                        </div>

                        <div className="pl-[22px] md:pl-0">
                          <div className="flex items-baseline justify-between text-[12.5px] text-ink-secondary">
                            <span>{g.total ? `${g.done} of ${g.total} objectives` : `${ts.done} of ${ts.open + ts.done} tasks`}</span>
                            <span className="font-medium text-foreground tabular-nums">{pct}%</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: project.color || 'var(--primary)' }} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pl-[22px] md:justify-end md:pl-0">
                          <span className={`text-[13px] tabular-nums md:w-36 md:text-right ${late ? 'font-medium text-danger' : 'text-ink-secondary'}`} title={project.deadline ? new Date(project.deadline).toLocaleDateString() : undefined}>
                            {project.status === 'COMPLETED' ? 'Finished' : when(d)}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            {project.status !== 'COMPLETED' && (
                              <button onClick={() => handleUpdateStatus(project.id, 'COMPLETED')} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-primary" title="Mark completed" aria-label={`Mark ${project.name} completed`}>
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {project.status !== 'ARCHIVED' ? (
                              <button onClick={() => handleUpdateStatus(project.id, 'ARCHIVED')} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" title="Archive" aria-label={`Archive ${project.name}`}>
                                <Archive className="w-4 h-4" />
                              </button>
                            ) : (
                              <button onClick={() => handleUpdateStatus(project.id, 'ACTIVE')} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" title="Restore" aria-label={`Restore ${project.name}`}>
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => openEditModal(project)} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" title="Edit" aria-label={`Edit ${project.name}`}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteProject(project.id)} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-danger-soft hover:text-danger" title="Delete" aria-label={`Delete ${project.name}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        );
      })()}

      {/* Edit / Create Modal */}
      {isModalOpen && (
        <Modal onClose={() => setIsModalOpen(false)} size="sm">
          <Modal.Header
            title={editingProject ? 'Edit project' : 'New project'}
            onClose={() => setIsModalOpen(false)}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="page-project-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Project name *</label>
                <input id="page-project-name"
                  type="text"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  required
                  placeholder="e.g. Perovskite stability study"
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              {!editingProject && teamOptions.length > 0 && (
                <div>
                  <label htmlFor="page-belongs-to" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Belongs to</label>
                  <select id="page-belongs-to"
                    value={projTeamId}
                    onChange={(e) => handleSelectTeam(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                  >
                    <option value="">Personal</option>
                    {teamOptions.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!editingProject && projTeamId && (
                <div>
                  <label className="block text-[12.5px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Add collaborators
                  </label>
                  {loadingTeamMembers ? (
                    <p className="text-xs text-muted-foreground">Loading team members…</p>
                  ) : teamMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No other team members yet.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 bg-surface-raised/60 border border-border rounded-md p-3">
                      {teamMembers.map((m) => (
                        <label key={m.userId} className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={projCollaboratorIds.includes(m.userId)}
                            onChange={() => toggleCollaborator(m.userId)}
                            className="accent-zinc-400 w-4 h-4 rounded border-border-strong shrink-0"
                          />
                          {m.name || m.email}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    You can add collaborators later from the project page.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="page-priority" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Priority</label>
                  <select id="page-priority"
                    value={projPriority}
                    onChange={(e) => setProjPriority(e.target.value as any)}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="page-deadline" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Deadline</label>
                  <input id="page-deadline"
                    type="date"
                    value={projDeadline}
                    onChange={(e) => setProjDeadline(e.target.value)}
                                       className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                  />
                </div>
                <div>
                  <label htmlFor="page-status" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Status</label>
                  <select id="page-status"
                    value={projStatus}
                    onChange={(e) => setProjStatus(e.target.value as any)}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ON_HOLD">On hold</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="page-description" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Description</label>
                <textarea id="page-description"
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  placeholder="What this project is for"
                  rows={3}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              {/* Objective templates — only when creating a fresh project with
                  no objectives yet. Picking one seeds the checklist with the
                  first item already done (endowed progress). */}
              {!editingProject && projGoalsList.length === 0 && (
                <div className="space-y-2">
                  <label className="block text-[12.5px] font-semibold text-muted-foreground mb-1">Start from a template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PROJECT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => {
                          setProjGoalsList(tpl.objectives.map((text, i) => ({
                            id: Math.random().toString(36).slice(2, 9),
                            text,
                            completed: i === 0
                          })));
                          if (!projDesc.trim()) setProjDesc(tpl.description);
                        }}
                        className="text-left border border-border hover:border-border-strong hover:bg-surface-sunken/40 rounded-md px-3 py-2 transition-colors"
                      >
                        <p className="text-[13px] font-semibold text-foreground">{tpl.name}</p>
                        <p className="text-[11px] text-ink-faint">{tpl.objectives.length} objectives · {tpl.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* dynamic goals editor - the list container always renders (min-h,
                  not conditional on length) so the modal doesn't jump in height
                  as the first goal is added or the last one is removed. */}
              <div className="space-y-2">
                <label htmlFor="page-objectives" className="block text-[12.5px] font-semibold text-muted-foreground mb-1">Objectives</label>
                <div className="flex gap-2">
                  <input id="page-objectives"
                    type="text"
                    value={newGoalText}
                    onChange={(e) => setNewGoalText(e.target.value)}
                    placeholder="Add an objective (e.g. Build the data pipeline)"
                    className="flex-1 bg-surface-raised border border-border rounded-md px-4 py-2 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                  <button
                    type="button"
                    onClick={handleAddGoalInModal}
                    className="px-4 py-2 bg-surface-sunken hover:bg-border-strong text-xs font-bold text-foreground rounded-md transition-colors"
                  >
                    Add
                  </button>
                </div>

                <div className="min-h-[3.25rem] bg-surface-raised/60 border border-border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {projGoalsList.length > 0 ? (
                    projGoalsList.map((g) => (
                      <div key={g.id} className="flex justify-between items-center bg-surface p-2.5 border border-border rounded-lg">
                        <div className="flex items-center gap-2.5 flex-1 mr-2">
                          <input
                            type="checkbox"
                            checked={g.completed}
                            onChange={() => handleToggleGoalInModal(g.id)}
                            className="accent-zinc-400 w-4 h-4 rounded border-border-strong shrink-0"
                          />
                          <input
                            type="text"
                            value={g.text}
                            onChange={(e) => {
                              const text = e.target.value;
                              setProjGoalsList(prev => prev.map(item => item.id === g.id ? { ...item, text } : item));
                            }}
                            className="bg-transparent border-none focus:outline-none text-foreground text-xs flex-1 truncate"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteGoalInModal(g.id)}
                          className="text-danger hover:text-danger text-[11.5px] font-semibold shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground py-1 px-0.5">No objectives yet. Add one above.</p>
                  )}
                </div>
              </div>

              {!editingProject && (
                <div className="flex items-center gap-2.5 py-1.5 px-1">
                  <input 
                    type="checkbox" 
                    id="createNotebook"
                    checked={createNotebook}
                    onChange={(e) => setCreateNotebook(e.target.checked)}
                    className="accent-zinc-200 w-4 h-4 rounded border-border-strong cursor-pointer"
                  />
                  <label htmlFor="createNotebook" className="text-xs font-semibold text-foreground cursor-pointer select-none">
                    Create a notebook for this project (default sections)
                  </label>
                </div>
              )}

              <div>
                <label className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Color</label>
                <div className="flex flex-wrap gap-2 p-3.5 bg-surface-raised border border-border rounded-md max-h-36 overflow-y-auto font-sans">
                  {PROJECT_COLORS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setProjColor(col.value)}
                      className={`w-6 h-6 rounded-full border transition-colors shrink-0 cursor-pointer ${projColor === col.value ? 'scale-110 border-white ring-2 ring-border-strong' : 'border-transparent'}`}
                      style={{ backgroundColor: col.value }}
                      title={col.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground hover:bg-surface-sunken text-sm font-semibold rounded-[9px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-full transition-[background-color,transform] hover:-translate-y-px active:scale-[0.97] cursor-pointer"
                >
                  {editingProject ? 'Save changes' : 'Create project'}
                </button>
              </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
export const dynamic = 'force-dynamic';
