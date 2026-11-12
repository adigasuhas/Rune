'use client';

import React from 'react';
import Link from 'next/link';
import { Archive, CheckCircle, Edit3, RefreshCw, Trash2, Users } from 'lucide-react';
import { projectEmphasis, tint, INVESTMENT_WINDOW_DAYS, type Emphasis } from '@/lib/projectEmphasis';

export interface ProjectInvestment {
  totalMs: number;
  recentMs: number;
  daily: number[];
  lastWorked: string | null;
}

type Status = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

const PRIORITY_LEVEL: Record<string, { n: number; label: string }> = {
  LOW: { n: 1, label: 'Low' },
  MEDIUM: { n: 2, label: 'Medium' },
  HIGH: { n: 3, label: 'High' },
  CRITICAL: { n: 4, label: 'Critical' },
};

const H = 3_600_000;

export function hoursLabel(ms: number): string {
  const h = ms / H;
  if (h <= 0) return '0h';
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  return h < 10 ? `${h.toFixed(1).replace(/\.0$/, '')}h` : `${Math.round(h)}h`;
}

/** Four rising ticks, filled to the priority - readable without colour. */
export function PriorityGlyph({ priority, className = '' }: { priority?: string | null; className?: string }) {
  const p = PRIORITY_LEVEL[priority || 'MEDIUM'] ?? PRIORITY_LEVEL.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= p.n ? 'bg-current' : 'bg-border-strong'}`} style={{ height: `${4 + i * 2}px` }} />
        ))}
      </span>
      <span>{p.label}</span>
    </span>
  );
}

/** Hours worked on each of the last 14 days, as small bars in the project's colour. */
export function ActivityStrip({ daily, days, color, max }: { daily: number[]; days: string[]; color: string; max: number }) {
  const top = Math.max(max, H);
  const worked = daily.filter((ms) => ms > 0).length;
  return (
    <span
      className="flex h-5 items-end gap-[2px]"
      role="img"
      aria-label={worked ? `Worked on ${worked} of the last ${daily.length} days` : `Not worked on in the last ${daily.length} days`}
    >
      {daily.map((ms, i) => (
        <span
          key={days[i] ?? i}
          title={`${days[i] ? new Date(`${days[i]}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''}: ${hoursLabel(ms)}`}
          className="w-[5px] rounded-t-[2px]"
          style={{ height: ms > 0 ? `${Math.max(3, (ms / top) * 20)}px` : '2px', backgroundColor: ms > 0 ? tint(color, 85) : 'var(--border-c)' }}
        />
      ))}
    </span>
  );
}

function relativeDay(ymd: string | null, today: string): string | null {
  if (!ymd) return null;
  const d = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function emphasisFor(priority: string | null | undefined, investment: ProjectInvestment | undefined, busiestRecentMs: number): Emphasis {
  return projectEmphasis(priority, (investment?.recentMs || 0) / H, busiestRecentMs / H);
}

/**
 * One project in the list. The colour rail on the left gets stronger with
 * priority; the row's wash gets deeper with your recent hours on it (see
 * projectEmphasis). Everything the colour says is also written down.
 */
export function ProjectRow({
  index = 0,
  project,
  investment,
  emphasis,
  strip,
  stripMax,
  today,
  progress,
  progressLabel,
  nextTask,
  openTasks,
  dueLabel,
  late,
  onStatus,
  onEdit,
  onDelete,
}: {
  index?: number;
  project: { id: string; name: string; description?: string | null; status: Status; priority?: string | null; color?: string | null; teamId?: string | null; deadline?: string | null };
  investment?: ProjectInvestment;
  emphasis: Emphasis;
  strip: string[];
  stripMax: number;
  today: string;
  progress: number;
  progressLabel: string;
  nextTask?: string | null;
  openTasks: number;
  dueLabel: string;
  late: boolean;
  onStatus: (s: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = project.color || 'var(--border-strong)';
  const settled = project.status === 'COMPLETED' || project.status === 'ARCHIVED';
  const description = project.description && project.description !== 'Demo project' ? project.description : null;
  const last = relativeDay(investment?.lastWorked ?? null, today);
  const btn = 'grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

  return (
    <li
      className="project-row group relative grid grid-cols-1 gap-x-8 gap-y-4 rounded-[10px] py-4 pl-5 pr-3 transition-[background-color] duration-[var(--duration-standard)] @2xl:grid-cols-2 @5xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] @5xl:items-center"
      style={{
        ['--row-i' as string]: Math.min(index, 12),
        ['--row-tint' as string]: tint(color, settled ? emphasis.tintPct / 2 : emphasis.tintPct),
        ['--row-tint-hover' as string]: tint(color, (settled ? emphasis.tintPct / 2 : emphasis.tintPct) + 1),
      }}
      data-priority={project.priority || 'MEDIUM'}
      data-edge={emphasis.edgePct}
      data-tint={emphasis.tintPct}
    >
      {/* Priority: the rail's strength */}
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
        style={{ backgroundColor: tint(color, settled ? emphasis.edgePct * 0.5 : emphasis.edgePct) }}
      />

      {/* Identity */}
      <div className="order-1 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={`/projects/${project.id}`} className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground hover:underline decoration-border-strong underline-offset-4">
            {project.name}
          </Link>
          {project.status !== 'ACTIVE' && (
            <span className="rounded-[5px] border border-border-strong px-1.5 py-px text-[11.5px] font-medium text-ink-secondary">
              {project.status === 'ON_HOLD' ? 'On hold' : project.status === 'COMPLETED' ? 'Completed' : 'Archived'}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[13.5px] text-ink-secondary">
          {nextTask ? <>Next: <span className="text-foreground">{nextTask}</span></> : description ?? (openTasks === 0 ? 'No open tasks.' : '')}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-secondary">
          <PriorityGlyph priority={project.priority} className={project.priority === 'CRITICAL' || project.priority === 'HIGH' ? 'text-foreground' : ''} />
          <span aria-hidden="true">·</span>
          <span>{openTasks} open</span>
          {project.teamId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" /> Team</span>
            </>
          )}
        </p>
      </div>

      {/* Progress */}
      <div className="order-3 @5xl:order-2">
        <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-ink-secondary">
          <span className="truncate">{progressLabel}</span>
          <span className="font-medium text-foreground tabular-nums">{progress}%</span>
        </div>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${project.name} progress`}>
          <div className="h-full rounded-full transition-[width] duration-[var(--duration-standard)]" style={{ width: `${progress}%`, backgroundColor: tint(color, 90) }} />
        </div>
      </div>

      {/* Time invested */}
      <div className="order-4 flex items-end justify-between gap-4 @5xl:order-3 @5xl:justify-start">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="font-serif text-[22px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums" data-testid="project-hours">{hoursLabel(investment?.totalMs || 0)}</span>
            <span className="text-[12px] text-ink-secondary">invested</span>
          </p>
          <p className="mt-1 whitespace-nowrap text-[12px] text-ink-secondary tabular-nums">
            {investment && investment.recentMs > 0 ? `${hoursLabel(investment.recentMs)} in ${INVESTMENT_WINDOW_DAYS} days` : last ? `Last worked ${last}` : 'Nothing logged yet'}
          </p>
        </div>
        <ActivityStrip daily={investment?.daily ?? strip.map(() => 0)} days={strip} color={color} max={stripMax} />
      </div>

      {/* Deadline and actions */}
      <div className="order-5 flex items-center justify-between gap-3 @2xl:order-2 @2xl:items-start @2xl:justify-end @5xl:order-4 @5xl:items-center">
        <span className={`whitespace-nowrap text-[13px] tabular-nums @2xl:text-right @5xl:w-32 ${late ? 'font-medium text-danger' : 'text-ink-secondary'}`} title={project.deadline ? new Date(project.deadline).toLocaleDateString() : undefined}>
          {dueLabel}
        </span>
        <div className="flex items-center gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {project.status !== 'COMPLETED' && (
            <button onClick={() => onStatus('COMPLETED')} className={`${btn} hover:text-primary`} title="Mark completed" aria-label={`Mark ${project.name} completed`}>
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
          {project.status !== 'ARCHIVED' ? (
            <button onClick={() => onStatus('ARCHIVED')} className={btn} title="Archive" aria-label={`Archive ${project.name}`}>
              <Archive className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={() => onStatus('ACTIVE')} className={btn} title="Restore" aria-label={`Restore ${project.name}`}>
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button onClick={onEdit} className={btn} title="Edit" aria-label={`Edit ${project.name}`}>
            <Edit3 className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className={`${btn} hover:!bg-danger-soft hover:text-danger`} title="Delete" aria-label={`Delete ${project.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** What the colour means, said once above the list. */
export function EmphasisLegend() {
  const sample = 'var(--primary)';
  return (
    <details className="group text-[12.5px] text-ink-secondary">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {[28, 55, 82, 100].map((p) => <span key={p} className="h-3.5 w-[3px] rounded-full" style={{ backgroundColor: tint(sample, p) }} />)}
          </span>
          Edge: priority
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {[0, 3, 5, 8].map((p) => <span key={p} className="h-3.5 w-4 rounded-[3px] border border-border" style={{ backgroundColor: tint(sample, p) }} />)}
          </span>
          Tint: your recent hours
        </span>
        <span className="text-ink-faint underline decoration-border-strong underline-offset-4 group-open:hidden">How it works</span>
      </summary>
      <p className="mt-2 max-w-2xl leading-relaxed text-ink-faint">
        The colour rail grows stronger with priority. The row’s tint deepens with the focused time you’ve logged on the project in the last {INVESTMENT_WINDOW_DAYS} days: ticked-off work, minus breaks and brain drain, never scheduled time. It’s measured against your busiest project, so an older project doesn’t outshine the rest just for being older. Priority and hours are also written on each row.
      </p>
    </details>
  );
}
