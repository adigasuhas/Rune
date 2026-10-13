'use client';

import { LoadError } from '@/components/LoadError';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Ban, ChevronRight, FileText } from 'lucide-react';
import { formatRelativeDeadline, daysUntil } from '@/lib/dateUtils';

interface ReviewItem {
  pageId: string;
  pageTitle: string;
  notebookTitle: string;
  projectName: string;
  ownerName: string;
  requestedAt: string | null;
  openComments: number;
}

interface StandupPerson {
  userId: string;
  name: string;
  doneCount: number;
  done: string[];
  inProgress: string[];
  blocked: { name: string; reason: string | null }[];
}
interface StandupTeam { teamId: string; teamName: string; people: StandupPerson[]; }

interface BlockedTask {
  name: string;
  ownerName: string;
  blockedReason: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  color: string;
  deadline: string | null;
  teamId: string;
  teamName: string;
  canEdit: boolean;
  taskStats: { total: number; completed: number; inProgress: number; blocked: number };
  blockedTasks: BlockedTask[];
  peopleCount: number;
  lastActivityAt: string;
}

interface Overview {
  teams: Array<{ id: string; name: string; role: string }>;
  projects: ProjectRow[];
  summary: { activeProjects: number; atRisk: number; blockedTasks: number };
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function LabPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [standup, setStandup] = useState<StandupTeam[]>([]);
  const [showStandup, setShowStandup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lab/overview')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    fetch('/api/review-queue')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setReviewQueue(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch('/api/lab/standup')
      .then(r => (r.ok ? r.json() : { teams: [] }))
      .then(d => setStandup(Array.isArray(d?.teams) ? d.teams : []))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return teamFilter === 'ALL' ? data.projects : data.projects.filter(p => p.teamId === teamFilter);
  }, [data, teamFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="app-title text-foreground">Lab</h1>
          <p className="text-ink-secondary text-sm mt-1">Project health across your team, in one view.</p>
        </div>
        <LoadError what="the lab overview" />
      </div>
    );
  }

  if (!data || data.teams.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="app-title text-foreground">Lab</h1>
          <p className="text-ink-secondary text-sm mt-1">Project health across your team, in one view.</p>
        </div>
        <div className="text-center py-20 rounded-[14px] bg-surface border border-border">
          <FlaskConical className="w-12 h-12 mx-auto text-ink-faint mb-3" />
          <p className="text-ink-secondary text-sm mb-1">You’re not on a team yet.</p>
          <Link href="/teams" className="text-xs text-primary hover:text-primary-hover font-semibold underline">
            Create or join a team
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title text-foreground">Lab</h1>
        <p className="text-ink-secondary text-sm mt-1">Project health across your team, in one view.</p>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-y border-border py-3">
        <div>
          <p className="font-serif text-[26px] font-medium leading-none text-foreground tabular-nums">{data.summary.activeProjects}</p>
          <p className="text-[11px] text-ink-faint">active projects</p>
        </div>
        <div>
          <p className={`font-serif text-[26px] font-medium leading-none tabular-nums ${data.summary.atRisk > 0 ? 'text-danger' : 'text-foreground'}`}>{data.summary.atRisk}</p>
          <p className="text-[11px] text-ink-faint">deadline within a week</p>
        </div>
        <div>
          <p className={`font-serif text-[26px] font-medium leading-none tabular-nums ${data.summary.blockedTasks > 0 ? 'text-[var(--color-data-slate)]' : 'text-foreground'}`}>{data.summary.blockedTasks}</p>
          <p className="text-[11px] text-ink-faint">blocked tasks</p>
        </div>
      </div>

      {/* Pages waiting on my review */}
      {reviewQueue.length > 0 && (
        <div className="border border-border rounded-md bg-surface">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[12.5px] font-semibold text-ink-secondary flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-ink-faint" /> Pages waiting on your review
            </span>
            <span className="text-[12.5px] text-ink-faint tabular-nums">{reviewQueue.length}</span>
          </div>
          <div className="divide-y divide-border">
            {reviewQueue.map(r => (
              <Link key={r.pageId} href={`/review/${r.pageId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-sunken/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{r.pageTitle}</p>
                  <p className="text-[11px] text-ink-faint truncate">{r.ownerName} · {r.projectName} · {r.notebookTitle}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.openComments > 0 && (
                    <span className="text-[12.5px] text-[var(--color-data-slate)]">{r.openComments} open</span>
                  )}
                  <span className="text-[12.5px] text-ink-faint">
                    {r.requestedAt ? relTime(r.requestedAt) : ''}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-faint" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Standup — leader-only read-out to seed a group meeting */}
      {standup.length > 0 && (
        <div className="border border-border rounded-md bg-surface">
          <button
            onClick={() => setShowStandup(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-border"
          >
            <span className="text-[12.5px] font-semibold text-ink-secondary">Standup</span>
            <ChevronRight className={`w-3.5 h-3.5 text-ink-faint transition-transform ${showStandup ? 'rotate-90' : ''}`} />
          </button>
          {showStandup && (
            <div className="divide-y divide-border">
              {standup.map(team => (
                <div key={team.teamId} className="px-4 py-3 space-y-3">
                  {standup.length > 1 && (
                    <p className="text-[11.5px] font-semibold text-ink-faint">{team.teamName}</p>
                  )}
                  {team.people.map(p => (
                    <div key={p.userId} className="text-[12px]">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      {p.done.length > 0 && (
                        <p className="text-ink-secondary">
                          <span className="text-primary">Done ({p.doneCount}):</span> {p.done.join(', ')}
                        </p>
                      )}
                      {p.inProgress.length > 0 && (
                        <p className="text-ink-secondary"><span className="text-ink-faint">In progress:</span> {p.inProgress.join(', ')}</p>
                      )}
                      {p.blocked.length > 0 && (
                        <p className="text-[var(--color-data-slate)]">
                          Blocked: {p.blocked.map(b => b.reason ? `${b.name} (${b.reason})` : b.name).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <p className="px-4 py-2 text-[10px] text-ink-faint">Last 7 days. Not a scoreboard: finished work and blockers, for the meeting.</p>
            </div>
          )}
        </div>
      )}

      {/* Team filter */}
      {data.teams.length > 1 && (
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {[{ id: 'ALL', name: 'All teams' }, ...data.teams].map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTeamFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-border' : ''} ${
                teamFilter === t.id ? 'bg-primary text-primary-foreground' : 'bg-surface text-ink-secondary hover:text-foreground hover:bg-surface-sunken'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Project rows */}
      {rows.length === 0 ? (
        <div className="text-center py-16 rounded-[14px] bg-surface border border-border">
          <p className="text-ink-secondary text-sm">No projects you can see in this team yet.</p>
          <p className="text-ink-faint text-xs mt-1">Ask the owner to add you as a collaborator, or turn on &ldquo;visible to team leaders&rdquo; on a project.</p>
        </div>
      ) : (
        <div className="border border-border rounded-md bg-surface overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Project', 'Team', 'Progress', 'Deadline', 'Blocked', 'Last activity', 'People'].map(h => (
                  <th key={h} className="text-[11.5px] font-semibold text-ink-secondary px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const rel = formatRelativeDeadline(p.deadline);
                const overdue = p.deadline ? daysUntil(p.deadline) < 0 && p.status === 'ACTIVE' && p.progress < 100 : false;
                const soon = p.deadline ? daysUntil(p.deadline) >= 0 && daysUntil(p.deadline) <= 7 && p.status === 'ACTIVE' && p.progress < 100 : false;
                const isOpen = expanded === p.id;
                const canExpand = p.blockedTasks.length > 0;
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className={`border-b border-border last:border-0 hover:bg-surface-sunken/50 ${canExpand ? 'cursor-pointer' : ''} ${isOpen ? 'bg-surface-sunken/40' : ''}`}
                      onClick={() => canExpand && setExpanded(isOpen ? null : p.id)}
                    >
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex items-center gap-2">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : p.id); }}
                              className="shrink-0 text-ink-faint hover:text-foreground"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? `Hide blocked tasks for ${p.name}` : `Show blocked tasks for ${p.name}`}
                            >
                              <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            </button>
                          ) : (
                            <span className="w-3 shrink-0" />
                          )}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || 'var(--border-strong)' }} />
                          <Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:text-primary transition-colors">
                            {p.name}
                          </Link>
                          {p.status !== 'ACTIVE' && (
                            <span className="text-[11.5px] font-semibold px-1 py-0.5 border border-border-strong text-ink-faint rounded-[3px]">{p.status}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-top text-ink-secondary whitespace-nowrap">{p.teamName}</td>
                      <td className="px-4 py-2.5 align-top w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-[3px] flex-1 bg-surface-sunken rounded-full overflow-hidden min-w-[3rem]">
                            <div className="h-full bg-primary" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-[12.5px] text-ink-faint tabular-nums shrink-0">{p.progress}%</span>
                        </div>
                        <span className="text-[12.5px] text-ink-faint">{p.taskStats.completed}/{p.taskStats.total} tasks</span>
                      </td>
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <span className={`text-[12.5px] ${overdue ? 'text-danger' : soon ? 'text-foreground' : 'text-ink-faint'}`}>
                          {rel || '–'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        {p.taskStats.blocked > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-data-slate)]">
                            <Ban className="w-3 h-3" /> {p.taskStats.blocked}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-ink-faint">–</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top text-[12.5px] text-ink-faint whitespace-nowrap">{relTime(p.lastActivityAt)}</td>
                      <td className="px-4 py-2.5 align-top text-[12.5px] text-ink-faint tabular-nums">{p.peopleCount}</td>
                    </tr>
                    {isOpen && canExpand && (
                      <tr className="border-b border-border last:border-0 bg-surface-sunken/40">
                        <td colSpan={7} className="px-4 pb-3 pt-0.5">
                          <p className="text-[11.5px] font-semibold text-ink-faint mb-1.5">Blocked</p>
                          <div className="space-y-1">
                            {p.blockedTasks.map((bt, i) => (
                              <p key={i} className="text-[12px] text-ink-secondary">
                                <span className="text-[var(--color-data-slate)]">{bt.name}</span>
                                {' · '}{bt.ownerName}
                                {bt.blockedReason ? ` · ${bt.blockedReason}` : ''}
                              </p>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
