'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronRight as Go, Download, PencilLine, Users } from 'lucide-react';
import type { ActivityLike } from '@/lib/activityTime';
import {
  buildTimeSheet,
  projectDays,
  projectTasksOf,
  REFLECTION_PROMPTS,
  type SheetEvent,
  type SheetReflection,
  type SheetTask,
} from '@/lib/projectTimeSheet';
import { tint } from '@/lib/projectEmphasis';
import { openReflection } from '@/lib/taskCompletion';
import { setUiPreference } from '@/lib/useUiPreference';
import { ActivityStrip, PriorityGlyph, emphasisFor, hoursLabel, type ProjectInvestment } from '@/components/projects/ProjectRow';
import { AnalyticsSection, DayBars, Fact, Facts, ShareRow, prefKey } from './parts';
import { ProjectTimeSheet, hm, longDate } from './ProjectTimeSheet';

/**
 * Analytics by project. The list uses the Projects page's own row language
 * (priority on the colour rail, recent hours in the tint, the 14-day strip),
 * here with what matters for analysis. Choosing a project opens its own view
 * - the same one the Projects page's "Analytics" shortcut opens - with the
 * daily time-management sheet folded away until it's wanted.
 */

export interface AnalyticsProject {
  id: string;
  name: string;
  description?: string | null;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  priority?: string | null;
  color?: string | null;
  deadline?: string | null;
  progress?: number;
  goals?: string | null;
  teamId?: string | null;
}

export interface ObjectiveMetric {
  id: string;
  text: string;
  planned: number;
  actual: number;
}

type Status = AnalyticsProject['status'] | 'ALL';
const STATUS_TABS: ReadonlyArray<readonly [Status, string]> = [['ACTIVE', 'Active'], ['ON_HOLD', 'On hold'], ['COMPLETED', 'Completed'], ['ARCHIVED', 'Archived'], ['ALL', 'All']];
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed', ARCHIVED: 'Archived' };
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const H = 3_600_000;

function shiftDay(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function shortDate(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function relDay(ymd: string | null, today: string) {
  if (!ymd) return null;
  const d = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : shortDate(ymd);
}

function taskCounts(projectId: string, tasks: SheetTask[]) {
  const own = projectTasksOf(projectId, tasks);
  const done = own.filter(t => t.status === 'COMPLETED').length;
  return { total: own.length, done, pct: own.length ? Math.round((done / own.length) * 100) : null };
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsAnalyticsList({
  projects,
  tasks,
  investment,
  today,
  onOpen,
  portfolio,
}: {
  projects: AnalyticsProject[];
  tasks: SheetTask[];
  investment: { days: string[]; projects: Record<string, ProjectInvestment> };
  today: string;
  onOpen: (id: string) => void;
  portfolio: { active: number; avgCompletion: number; distribution: { completed: number; nearCompletion: number; inProgress: number; atRisk: number } };
}) {
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [sort, setSort] = useState<'invested' | 'priority' | 'progress' | 'name'>('invested');
  const busiest = Math.max(0, ...Object.values(investment.projects).map(x => x.recentMs));
  const stripMax = Math.max(0, ...Object.values(investment.projects).flatMap(x => x.daily));
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: projects.length };
    projects.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [projects]);
  const recentTotal = Object.values(investment.projects).reduce((s, x) => s + x.recentMs, 0);

  const rows = useMemo(() => {
    const list = projects.filter(p => status === 'ALL' || p.status === status).map(p => ({ p, inv: investment.projects[p.id], tc: taskCounts(p.id, tasks) }));
    list.sort((a, b) => {
      if (sort === 'name') return a.p.name.localeCompare(b.p.name);
      if (sort === 'progress') return (b.tc.pct ?? -1) - (a.tc.pct ?? -1) || a.p.name.localeCompare(b.p.name);
      if (sort === 'priority') return (PRIORITY_RANK[b.p.priority || 'MEDIUM'] ?? 2) - (PRIORITY_RANK[a.p.priority || 'MEDIUM'] ?? 2) || (b.inv?.recentMs || 0) - (a.inv?.recentMs || 0);
      return (b.inv?.recentMs || 0) - (a.inv?.recentMs || 0) || (b.inv?.totalMs || 0) - (a.inv?.totalMs || 0) || a.p.name.localeCompare(b.p.name);
    });
    return list;
  }, [projects, status, sort, investment, tasks]);

  if (projects.length === 0) {
    return <p className="py-6 text-[14px] text-ink-secondary">No projects yet. <Link href="/projects" className="font-medium text-foreground underline decoration-border-strong underline-offset-4">Create one</Link> and its time and tasks show up here.</p>;
  }

  return (
    <div className="space-y-8">
      <Facts cols="lg:grid-cols-4" label="All projects">
        <Fact label="Active projects">{portfolio.active}</Fact>
        <Fact label="Your hours, last 30 days">{hoursLabel(recentTotal)}</Fact>
        <Fact label="Average completion">{Math.round(portfolio.avgCompletion)}%</Fact>
        <Fact label="Needing attention" sub="active, under 20% done">{portfolio.distribution.atRisk}</Fact>
      </Facts>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={status === v}
                onClick={() => setStatus(v)}
                className={`-mb-px shrink-0 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${status === v ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'}`}
              >
                {l}<span className="ml-1.5 text-[12px] font-normal text-ink-faint tabular-nums">{counts[v] || 0}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 pb-2 text-[12.5px] text-ink-secondary">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[13px] text-foreground focus:border-border-strong focus:outline-none">
              <option value="invested">Recent hours</option>
              <option value="priority">Priority</option>
              <option value="progress">Tasks done</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-[14px] text-ink-secondary">No projects in this view.</p>
        ) : (
          <ul className="@container mt-2 space-y-1" aria-label="Projects">
            {rows.map(({ p, inv, tc }, i) => {
              const color = p.color || 'var(--border-strong)';
              const e = emphasisFor(p.priority, inv, busiest);
              const settled = p.status === 'COMPLETED' || p.status === 'ARCHIVED';
              const last = relDay(inv?.lastWorked ?? null, today);
              return (
                <li
                  key={p.id}
                  className="project-row group relative rounded-[10px]"
                  style={{
                    ['--row-i' as string]: Math.min(i, 12),
                    ['--row-tint' as string]: tint(color, settled ? e.tintPct / 2 : e.tintPct),
                    ['--row-tint-hover' as string]: tint(color, (settled ? e.tintPct / 2 : e.tintPct) + 1),
                  }}
                  data-testid="analytics-project-row"
                >
                  <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full" style={{ backgroundColor: tint(color, settled ? e.edgePct * 0.5 : e.edgePct) }} />
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="grid w-full grid-cols-1 items-center gap-x-8 gap-y-3 rounded-[10px] py-3.5 pl-5 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto]"
                    aria-label={`${p.name}: open analytics`}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-foreground">{p.name}</span>
                        {p.status !== 'ACTIVE' && <span className="shrink-0 rounded-[5px] border border-border-strong px-1.5 py-px text-[11.5px] font-medium text-ink-secondary">{STATUS_LABEL[p.status]}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-ink-secondary">
                        <PriorityGlyph priority={p.priority} className={p.priority === 'CRITICAL' || p.priority === 'HIGH' ? 'text-foreground' : ''} />
                        {p.teamId && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" /> Team</span>}
                        <span>{last ? `Last worked ${last}` : 'Not worked on yet'}</span>
                      </span>
                    </span>
                    <span className="flex items-end justify-between gap-4 @2xl:justify-start">
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums">{hoursLabel(inv?.totalMs || 0)}</span>
                          <span className="text-[12px] text-ink-secondary">invested</span>
                        </span>
                        <span className="mt-1 block whitespace-nowrap text-[12px] text-ink-secondary tabular-nums">{hoursLabel(inv?.recentMs || 0)} in 30 days</span>
                      </span>
                      <ActivityStrip daily={inv?.daily ?? investment.days.map(() => 0)} days={investment.days} color={color} max={stripMax} />
                    </span>
                    <span>
                      <span className="flex items-baseline justify-between gap-3 text-[12.5px] text-ink-secondary">
                        <span>{tc.total ? `${tc.done} of ${tc.total} tasks` : 'No tasks yet'}</span>
                        {tc.pct !== null && <span className="font-medium text-foreground tabular-nums">{tc.pct}%</span>}
                      </span>
                      <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${tc.pct ?? 0}%`, backgroundColor: tint(color, 90) }} />
                      </span>
                    </span>
                    <Go className="hidden h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground @2xl:block" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AnalyticsSection
        id="portfolio"
        title="Portfolio health"
        summary={`${portfolio.distribution.completed} done · ${portfolio.distribution.nearCompletion} nearly there · ${portfolio.distribution.atRisk} under 20%`}
        defaultOpen={false}
      >
        <div className="max-w-2xl">
          {([
            ['Completed', portfolio.distribution.completed, 'var(--time-work)'],
            ['Nearly done (80% or more)', portfolio.distribution.nearCompletion, 'var(--primary)'],
            ['In progress (20–80%)', portfolio.distribution.inProgress, 'var(--primary)'],
            ['Under 20% done', portfolio.distribution.atRisk, 'var(--danger)'],
          ] as const).map(([l, n, c]) => (
            <ShareRow key={l} label={l} pct={projects.length ? (n / projects.length) * 100 : 0} count={`${n} · ${projects.length ? Math.round((n / projects.length) * 100) : 0}%`} color={c} />
          ))}
          <p className="mt-2 text-[12px] text-ink-secondary">Shares of all {projects.length} projects. Progress is the share of a project’s tasks that are done.</p>
        </div>
      </AnalyticsSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One project                                                         */
/* ------------------------------------------------------------------ */

export function ProjectAnalyticsView({
  project,
  tasks,
  events,
  sessions,
  reflections,
  investment,
  timezone,
  today,
  initialDate,
  objectives,
  onExportObjectives,
  onBack,
}: {
  project: AnalyticsProject;
  tasks: SheetTask[];
  events: SheetEvent[];
  sessions: ActivityLike[];
  reflections: SheetReflection[];
  investment?: ProjectInvestment;
  timezone: string;
  today: string;
  initialDate?: string | null;
  objectives: ObjectiveMetric[];
  onExportObjectives: () => void;
  onBack: () => void;
}) {
  const [date, setDate] = useState(initialDate || today);
  const own = useMemo(() => projectTasksOf(project.id, tasks), [project.id, tasks]);
  const history = useMemo(() => projectDays({ projectId: project.id, tasks, events, sessions, reflections, timezone }), [project.id, tasks, events, sessions, reflections, timezone]);
  const sheet = useMemo(() => buildTimeSheet({ project, tasks, events, sessions, reflections, dateStr: date, timezone }), [project, tasks, events, sessions, reflections, date, timezone]);
  const byDate = useMemo(() => new Map(history.map(d => [d.date, d])), [history]);

  const color = project.color || 'var(--primary)';
  const days30 = Array.from({ length: 30 }, (_, i) => shiftDay(today, i - 29));
  const daily = days30.map(d => (byDate.get(d)?.focusedMs || 0) / H);
  const worked = history.filter(d => d.focusedMs > 0);
  const totalMs = history.reduce((s, d) => s + d.focusedMs, 0);
  const weekMs = history.filter(d => d.date > shiftDay(today, -7)).reduce((s, d) => s + d.focusedMs, 0);
  const best = worked.reduce<typeof worked[number] | null>((b, d) => (!b || d.focusedMs > b.focusedMs ? d : b), null);

  const statusCounts = {
    COMPLETED: own.filter(t => t.status === 'COMPLETED').length,
    IN_PROGRESS: own.filter(t => t.status === 'IN_PROGRESS').length,
    PENDING: own.filter(t => t.status === 'PENDING').length,
    BLOCKED: own.filter(t => t.status === 'BLOCKED').length,
  };
  const pct = own.length ? Math.round((statusCounts.COMPLETED / own.length) * 100) : null;
  const goals = (() => {
    try {
      const g = JSON.parse(project.goals || '[]');
      return Array.isArray(g) ? (g as { completed?: boolean }[]) : [];
    } catch {
      return [];
    }
  })();
  const goalsDone = goals.filter(g => g.completed).length;

  const ownIds = new Set(own.map(t => t.id));
  const nameOf = new Map(own.map(t => [t.id, t.name]));
  const projectReflections = reflections.filter(r => ownIds.has(r.taskId)).sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1));

  const daysLeft = project.deadline ? Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86_400_000) : null;
  const due = daysLeft == null ? 'None' : daysLeft < 0 ? `${-daysLeft}d overdue` : daysLeft === 0 ? 'Today' : `In ${daysLeft}d`;

  // Open the time sheet on a given day, and bring the whole of it into view.
  const openSheet = (d: string) => {
    setDate(d);
    setUiPreference(prefKey('project-sheet'), true);
    requestAnimationFrame(() => document.querySelector('[data-section="project-sheet"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="space-y-8" data-testid="project-analytics">
      <div>
        <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-1 rounded-[6px] py-1 pl-0.5 pr-1.5 text-[13.5px] text-ink-secondary transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All projects
        </button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-3 font-serif text-[32px] font-medium leading-tight tracking-[-0.02em] text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </h2>
            {project.description && project.description !== 'Demo project' && <p className="mt-1 max-w-2xl text-[14.5px] text-ink-secondary">{project.description}</p>}
          </div>
          <Link href={`/projects/${project.id}`} className="flex h-9 items-center rounded-[9px] border border-border-strong bg-surface px-3.5 text-[14px] font-semibold text-foreground hover:bg-surface-raised">
            Open project
          </Link>
        </div>
      </div>

      <Facts cols="lg:grid-cols-6" label="Project at a glance">
        <Fact label="Status">{STATUS_LABEL[project.status]}</Fact>
        <Fact label="Priority"><PriorityGlyph priority={project.priority} className="font-sans text-[15px] font-medium" /></Fact>
        <Fact label="Deadline" sub={project.deadline ? new Date(project.deadline).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : undefined}>{due}</Fact>
        <Fact label="Tasks done" sub={pct !== null ? `${pct}%` : undefined}>{statusCounts.COMPLETED}<span className="text-[16px] text-ink-secondary"> of {own.length}</span></Fact>
        <Fact label="Invested" sub={`${hoursLabel(investment?.recentMs ?? 0)} in 30 days`} testId="project-invested">{hoursLabel(totalMs)}</Fact>
        <Fact label="Days worked" sub={worked.length ? `last ${relDay(worked[0].date, today)}` : undefined}>{worked.length}</Fact>
      </Facts>

      <div>
        <AnalyticsSection id="project-time" title="Time invested" summary={`${hoursLabel(weekMs)} this week · ${hoursLabel(totalMs)} in all`}>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <DayBars days={days30} values={daily} color={color} format={(v) => (v > 0 ? `${hm(v * H)} focused` : 'Nothing logged')} label="Focused hours per day, last 30 days" />
            <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4 lg:grid-cols-1">
              {[
                [hm(weekMs), 'in the last 7 days'],
                [worked.length ? hm(totalMs / worked.length) : '—', 'per day worked'],
                [best ? hm(best.focusedMs) : '—', best ? `best day, ${shortDate(best.date)}` : 'best day'],
              ].map(([v, l]) => (
                <div key={l} className="flex flex-col-reverse">
                  <dt className="mt-1 text-[12.5px] text-ink-secondary">{l}</dt>
                  <dd className="font-serif text-[22px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4 text-[12px] text-ink-secondary">Your focused time: ticked-off work on this project’s tasks, less breaks and brain drain. Scheduled time that wasn’t worked isn’t counted.</p>
        </AnalyticsSection>

        <AnalyticsSection
          id="project-tasks"
          title="Tasks and progress"
          summary={`${statusCounts.COMPLETED} of ${own.length} done${goals.length ? ` · ${goalsDone} of ${goals.length} objectives` : ''}`}
        >
          <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[12.5px] font-semibold text-ink-secondary">Where the tasks are</h3>
              {([
                ['Done', statusCounts.COMPLETED, 'var(--time-work)'],
                ['In progress', statusCounts.IN_PROGRESS, 'var(--primary)'],
                ['To do', statusCounts.PENDING, 'var(--border-strong)'],
                ['Blocked', statusCounts.BLOCKED, 'var(--warning)'],
              ] as const).map(([l, n, c]) => (
                <ShareRow key={l} label={l} pct={own.length ? (n / own.length) * 100 : 0} count={String(n)} color={c} />
              ))}
              {goals.length > 0 && (
                <ShareRow label="Objectives met" pct={(goalsDone / goals.length) * 100} count={`${goalsDone} of ${goals.length}`} color={color} />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="text-[12.5px] font-semibold text-ink-secondary">Planned and actual time by objective</h3>
                {objectives.length > 0 && (
                  <button type="button" onClick={onExportObjectives} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-secondary hover:text-foreground">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                  </button>
                )}
              </div>
              {objectives.length === 0 ? (
                <p className="py-1.5 text-[13px] text-ink-secondary">No objectives or tasks yet.</p>
              ) : (
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-border text-[12px] text-ink-faint">
                      <th className="py-1.5 text-left font-medium">Objective</th>
                      <th className="py-1.5 text-right font-medium">Planned</th>
                      <th className="py-1.5 text-right font-medium">Actual</th>
                      <th className="py-1.5 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {objectives.map(m => (
                      <tr key={m.id}>
                        <td className="max-w-[14rem] truncate py-1.5 text-foreground">{m.text}</td>
                        <td className="py-1.5 text-right text-ink-secondary">{m.planned.toFixed(1)}h</td>
                        <td className="py-1.5 text-right text-foreground">{m.actual.toFixed(1)}h</td>
                        <td className="py-1.5 text-right text-ink-secondary">{m.actual - m.planned > 0 ? '+' : ''}{(m.actual - m.planned).toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </AnalyticsSection>

        <AnalyticsSection
          id="project-sheet"
          title="Time management"
          summary={`Daily sheet · ${longDate(date)}`}
          defaultOpen={false}
          actions={
            <div className="flex items-center">
              <button type="button" onClick={() => setDate(shiftDay(date, -1))} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input type="date" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[13px] text-foreground tabular-nums focus:border-border-strong focus:outline-none" />
              <button type="button" onClick={() => setDate(shiftDay(date, 1))} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </button>
              {date !== today && (
                <button type="button" onClick={() => setDate(today)} className="h-8 rounded-[8px] px-2 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">Today</button>
              )}
            </div>
          }
        >
          <ProjectTimeSheet project={project} sheet={sheet} timezone={timezone} />
        </AnalyticsSection>

        <AnalyticsSection id="project-days" title="Daily records" summary={worked.length ? `${worked.length} days worked · latest ${shortDate(worked[0].date)}` : 'Nothing recorded yet'}>
          {history.length === 0 ? (
            <p className="text-[13px] text-ink-secondary">No work recorded on this project yet.</p>
          ) : (
            <DaysList history={history} color={color} onOpen={openSheet} current={date} />
          )}
        </AnalyticsSection>

        <AnalyticsSection id="project-reflections" title="Reflections" summary={projectReflections.length ? `${projectReflections.length} written` : 'None yet'} defaultOpen={false}>
          {projectReflections.length === 0 ? (
            <p className="text-[13px] text-ink-secondary">You’ll be asked a few questions each time you finish one of this project’s tasks. What you write shows here and on that day’s sheet.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="project-reflections">
              {projectReflections.map(r => (
                <li key={r.taskId} className="grid grid-cols-1 gap-x-8 gap-y-2 py-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">{nameOf.get(r.taskId) ?? 'Task'}</p>
                    <p className="text-[12.5px] text-ink-secondary">Finished {shortDate(r.completedOn)}</p>
                    <div className="mt-1.5 flex gap-3 text-[12.5px]">
                      <button type="button" onClick={() => openReflection({ id: r.taskId, name: nameOf.get(r.taskId) ?? 'Task' })} className="inline-flex items-center gap-1 font-medium text-ink-secondary hover:text-foreground">
                        <PencilLine className="h-3 w-3" aria-hidden="true" /> Edit
                      </button>
                      <button type="button" onClick={() => openSheet(r.completedOn)} className="font-medium text-ink-secondary hover:text-foreground">That day’s sheet</button>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                    {REFLECTION_PROMPTS.filter(p => r[p.key]).map(p => (
                      <div key={p.key} className="min-w-0">
                        <dt className="text-[12px] text-ink-secondary">{p.label}</dt>
                        <dd className="text-[13.5px] leading-snug text-foreground">{r[p.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </AnalyticsSection>
      </div>
    </div>
  );
}

function DaysList({ history, color, onOpen, current }: { history: ReturnType<typeof projectDays>; color: string; onOpen: (d: string) => void; current: string }) {
  const [limit, setLimit] = useState(10);
  const max = Math.max(...history.map(x => x.focusedMs), 1);
  return (
    <>
      <ul className="divide-y divide-border">
        {history.slice(0, limit).map(d => (
          <li key={d.date}>
            <button
              type="button"
              onClick={() => onOpen(d.date)}
              aria-current={d.date === current ? 'date' : undefined}
              className={`grid w-full grid-cols-[8rem_1fr_auto] items-center gap-4 rounded-[6px] px-1.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-sunken sm:grid-cols-[9rem_1fr_9rem] ${d.date === current ? 'bg-surface-sunken font-medium' : ''}`}
            >
              <span className="text-ink-secondary tabular-nums">{shortDate(d.date)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${(d.focusedMs / max) * 100}%`, backgroundColor: color }} />
              </span>
              <span className="text-right tabular-nums text-foreground">
                {hm(d.focusedMs)}
                {d.completed > 0 && <span className="ml-2 text-[12px] text-ink-secondary">{d.completed} done</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {history.length > limit && (
        <button type="button" onClick={() => setLimit(n => n + 20)} className="mt-2 text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
          Show earlier days
        </button>
      )}
    </>
  );
}
