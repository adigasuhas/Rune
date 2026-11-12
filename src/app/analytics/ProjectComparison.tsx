'use client';

import React, { useMemo } from 'react';
import type { ActivityLike } from '@/lib/activityTime';
import { projectDays, projectTasksOf, type SheetEvent, type SheetReflection, type SheetTask } from '@/lib/projectTimeSheet';

/**
 * Projects side by side: your actual focused time on each (last 30 days and
 * all time - never scheduled hours), tasks finished, priority and progress.
 * Clicking a row opens its time sheet.
 */

const PRIORITY: Record<string, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function hours(ms: number) {
  const h = ms / 3_600_000;
  return h === 0 ? '0h' : h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
}

function back(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ProjectComparison({
  projects,
  tasks,
  events,
  sessions,
  reflections,
  timezone,
  today,
  onOpen,
}: {
  projects: Array<{ id: string; name: string; priority?: string | null; color?: string | null; status?: string; progress?: number }>;
  tasks: SheetTask[];
  events: SheetEvent[];
  sessions: ActivityLike[];
  reflections: SheetReflection[];
  timezone: string;
  today: string;
  onOpen: (projectId: string) => void;
}) {
  const rows = useMemo(() => {
    const since = back(today, 29);
    return projects
      .filter(p => p.status !== 'ARCHIVED')
      .map(p => {
        const days = projectDays({ projectId: p.id, tasks, events, sessions, reflections, timezone });
        const own = projectTasksOf(p.id, tasks);
        const done = own.filter(t => t.status === 'COMPLETED').length;
        return {
          ...p,
          recentMs: days.filter(d => d.date >= since).reduce((s, d) => s + d.focusedMs, 0),
          totalMs: days.reduce((s, d) => s + d.focusedMs, 0),
          done,
          total: own.length,
          pct: own.length ? Math.round((done / own.length) * 100) : null,
        };
      })
      .sort((a, b) => b.recentMs - a.recentMs || b.totalMs - a.totalMs || (PRIORITY_ORDER[a.priority || 'MEDIUM'] ?? 2) - (PRIORITY_ORDER[b.priority || 'MEDIUM'] ?? 2));
  }, [projects, tasks, events, sessions, reflections, timezone, today]);

  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(r => r.recentMs), 1);

  return (
    <section aria-labelledby="compare-projects" className="space-y-3">
      <div>
        <h2 id="compare-projects" className="font-display text-base font-bold tracking-tight text-foreground">Compare projects</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">Your focused time on each, from ticked-off work less breaks and brain drain. Scheduled time that wasn’t worked isn’t counted.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-border-strong text-[12px] text-ink-faint">
              <th className="py-2 pr-3 font-medium">Project</th>
              <th className="py-2 pr-3 font-medium">Priority</th>
              <th className="w-[30%] py-2 pr-3 font-medium">Last 30 days</th>
              <th className="py-2 pr-3 text-right font-medium">All time</th>
              <th className="py-2 text-right font-medium">Tasks done</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.id} className="group cursor-pointer hover:bg-surface-sunken/60" onClick={() => onOpen(r.id)}>
                <td className="py-2.5 pr-3">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }} className="flex min-w-0 items-center gap-2 text-left font-medium text-foreground hover:underline">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color || 'var(--border-strong)' }} aria-hidden="true" />
                    <span className="truncate">{r.name}</span>
                  </button>
                </td>
                <td className="py-2.5 pr-3 text-ink-secondary">{PRIORITY[r.priority || 'MEDIUM']}</td>
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2.5">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${(r.recentMs / max) * 100}%`, backgroundColor: r.color || 'var(--time-work)' }} />
                    </span>
                    <span className="w-12 text-right tabular-nums text-foreground">{hours(r.recentMs)}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-secondary">{hours(r.totalMs)}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-secondary">
                  {r.done}/{r.total}{r.pct !== null && <span className="ml-1.5 text-[12px] text-ink-faint">{r.pct}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
