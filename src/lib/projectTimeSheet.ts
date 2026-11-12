import { getLocalDateString } from './dateUtils';
import { collectWorkIntervals, subtractIntervals, type WorkInterval } from './analyticsUtils';
import { awayCovers, mergeSpans, overlapMs, sessionSpan, spanMs, type ActivityLike } from './activityTime';

/**
 * The project time sheet ("Time management", New Feature.pdf): one project,
 * one day, filled in from what Rune already knows - the project's tasks,
 * their ticked-off (or under way) slots, and the breaks and brain drain
 * recorded that day. Only the Reflection block is written by hand, when a
 * task is finished.
 *
 * Time rules (shared with Analytics):
 *  - Work is a task's real slots (scheduled time that was never ticked off
 *    and has not happened yet is not work).
 *  - Focused time = work with breaks and brain drain cut out.
 *  - A slot belongs to the day it started, so work past midnight stays on
 *    the day it began.
 */

export interface SheetTask {
  id: string;
  name: string;
  projectId?: string | null;
  status: string;
  date: string | Date;
  estimatedTime?: number | null;
  actualTime?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  sessionType?: string;
}

export interface SheetEvent {
  start: string | Date;
  end: string | Date;
  taskId?: string | null;
  completed?: boolean;
  sessionType?: string;
}

export interface SheetReflection {
  taskId: string;
  completedOn: string;
  productiveMoment?: string | null;
  timeWaster?: string | null;
  gladFinished?: string | null;
  improvement?: string | null;
  planningRealistic?: string | null;
  lesson?: string | null;
}

export const REFLECTION_PROMPTS = [
  { key: 'productiveMoment', label: 'Most productive moment' },
  { key: 'timeWaster', label: 'Biggest time-waster' },
  { key: 'gladFinished', label: 'One task I’m glad I finished' },
  { key: 'improvement', label: 'One improvement for next time' },
  { key: 'planningRealistic', label: 'Was my planning realistic?' },
  { key: 'lesson', label: 'One lesson about my time management today' },
] as const;

export type ReflectionKey = (typeof REFLECTION_PROMPTS)[number]['key'];

export type SheetPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type SheetStatus = 'IN_PROGRESS' | 'COMPLETED' | 'PENDING';

export interface TrackerRow {
  taskId: string;
  name: string;
  status: string;
  targetMs: number;
  actualMs: number;
  diffMs: number;
}

export interface LogRow {
  taskId: string | null;
  name: string;
  /** Null for time recorded without clock times. */
  start: Date | null;
  end: Date | null;
  spentMs: number;
  breakMs: number;
  drainMs: number;
  ongoing: boolean;
}

export interface Highlight {
  ms: number;
  taskName: string | null;
  at: Date;
}

export interface TimeSheet {
  date: string;
  estimatedMs: number;
  priority: SheetPriority;
  critical: boolean;
  status: SheetStatus | null;
  tracker: TrackerRow[];
  trackerTotal: { targetMs: number; actualMs: number; diffMs: number };
  log: LogRow[];
  summary: {
    focusedMs: number;
    breakMs: number;
    drainMs: number;
    workMs: number;
    efficiency: number | null;
    biggestDrain: Highlight | null;
    boost: Highlight | null;
    focusBreaks: number;
  };
  reflections: Array<SheetReflection & { taskName: string }>;
}

const HOUR = 3_600_000;

function localDay(value: string | Date, timezone: string): string | null {
  try {
    return getLocalDateString(value, timezone);
  } catch {
    return null;
  }
}

/** The project's tasks that count: everything but cancelled ones. */
export function projectTasksOf<T extends SheetTask>(projectId: string, tasks: T[]): T[] {
  return tasks.filter(t => t.projectId === projectId && t.status !== 'CANCELLED');
}

/**
 * The day's work intervals for a set of tasks: their slots that started that
 * day (ticked off, or under way with `now`), and completed tasks' own time.
 */
export function workOnDay(dateStr: string, tasks: SheetTask[], events: SheetEvent[], timezone: string, now?: Date): WorkInterval[] {
  const ids = new Set(tasks.map(t => t.id));
  const dayEvents = events.filter(e => e.taskId && ids.has(e.taskId) && localDay(e.start, timezone) === dateStr);
  const withSlotsToday = new Set(dayEvents.map(e => e.taskId));
  const dayTasks = tasks.filter(t => localDay(t.date, timezone) === dateStr || withSlotsToday.has(t.id));
  return collectWorkIntervals(dateStr, dayTasks, dayEvents, timezone, undefined, now);
}

function mapPriority(p: string | null | undefined): { priority: SheetPriority; critical: boolean } {
  if (p === 'CRITICAL') return { priority: 'HIGH', critical: true };
  if (p === 'HIGH' || p === 'LOW') return { priority: p, critical: false };
  return { priority: 'MEDIUM', critical: false };
}

export function buildTimeSheet(input: {
  project: { id: string; priority?: string | null };
  tasks: SheetTask[];
  events: SheetEvent[];
  sessions: ActivityLike[];
  reflections: SheetReflection[];
  dateStr: string;
  timezone: string;
  now?: Date;
}): TimeSheet {
  const { project, events, sessions, reflections, dateStr, timezone } = input;
  const now = input.now ?? new Date();
  const tasks = projectTasksOf(project.id, input.tasks);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const nameOf = (id: string | null | undefined) => (id ? byId.get(id)?.name ?? null : null);

  const work = workOnDay(dateStr, tasks, events, timezone, now);
  const away = awayCovers(sessions, now);
  const workCover = mergeSpans(work);

  // The day's tasks: planned for it, or worked on it.
  const workedIds = new Set(work.map(w => w.taskId).filter(Boolean) as string[]);
  const dayTasks = tasks
    .filter(t => localDay(t.date, timezone) === dateStr || workedIds.has(t.id))
    .sort((a, b) => {
      const fa = work.find(w => w.taskId === a.id)?.start.getTime() ?? Infinity;
      const fb = work.find(w => w.taskId === b.id)?.start.getTime() ?? Infinity;
      return fa - fb || a.name.localeCompare(b.name);
    });

  const plannedToday = dayTasks.filter(t => localDay(t.date, timezone) === dateStr);
  const estimatedMs = plannedToday.reduce((s, t) => s + Math.max(0, t.estimatedTime || 0) * HOUR, 0);

  const tracker: TrackerRow[] = dayTasks.map(t => {
    const own = work.filter(w => w.taskId === t.id);
    const actualMs = spanMs(subtractIntervals(own, away.all));
    const targetMs = Math.max(0, t.estimatedTime || 0) * HOUR;
    return { taskId: t.id, name: t.name, status: t.status, targetMs, actualMs, diffMs: actualMs - targetMs };
  });
  const trackerTotal = {
    targetMs: tracker.reduce((s, r) => s + r.targetMs, 0),
    actualMs: spanMs(subtractIntervals(workCover, away.all)),
    diffMs: 0,
  };
  trackerTotal.diffMs = trackerTotal.actualMs - trackerTotal.targetMs;

  const log: LogRow[] = [...work]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(w => {
      const span = [{ start: w.start, end: w.end }];
      const breakMs = w.approx ? 0 : overlapMs(span, away.breaks);
      const drainMs = w.approx ? 0 : overlapMs(span, away.drain);
      return {
        taskId: w.taskId,
        name: nameOf(w.taskId) ?? 'Task',
        start: w.approx ? null : w.start,
        end: w.approx ? null : w.end,
        spentMs: w.end.getTime() - w.start.getTime() - breakMs - drainMs,
        breakMs,
        drainMs,
        ongoing: !w.approx && w.end.getTime() >= now.getTime() - 60_000 && w.start <= now,
      };
    });

  const workMs = spanMs(workCover);
  const breakMs = overlapMs(workCover, away.breaks);
  const drainMs = overlapMs(workCover, away.drain);
  const focusedMs = workMs - breakMs - drainMs;

  let biggestDrain: Highlight | null = null;
  const workNotOnBreak = subtractIntervals(workCover, away.breaks);
  for (const s of sessions) {
    if (s.kind !== 'BRAIN_DRAIN') continue;
    const span = sessionSpan(s, now);
    if (!span) continue;
    const ms = overlapMs([span], workNotOnBreak);
    if (ms <= 0 || (biggestDrain && ms <= biggestDrain.ms)) continue;
    const during = work.find(w => w.start < span.end && span.start < w.end);
    biggestDrain = { ms, taskName: nameOf(during?.taskId), at: span.start };
  }

  // The longest stretch of focus with no break or drift in it (clocked work only).
  let boost: Highlight | null = null;
  for (const piece of mergeSpans(subtractIntervals(mergeSpans(work.filter(w => !w.approx)), away.all))) {
    const ms = piece.end.getTime() - piece.start.getTime();
    if (boost && ms <= boost.ms) continue;
    const during = work.find(w => !w.approx && w.start <= piece.start && piece.start < w.end);
    boost = { ms, taskName: nameOf(during?.taskId), at: piece.start };
  }

  const focusBreaks = sessions.filter(s => {
    if (s.kind !== 'BREAK') return false;
    const span = sessionSpan(s, now);
    return !!span && overlapMs([span], workCover) > 0;
  }).length;

  let status: SheetStatus | null = null;
  if (dayTasks.length > 0) {
    if (dayTasks.every(t => t.status === 'COMPLETED')) status = 'COMPLETED';
    else if (dayTasks.some(t => t.status === 'IN_PROGRESS' || t.status === 'COMPLETED') || workMs > 0) status = 'IN_PROGRESS';
    else status = 'PENDING';
  }

  const dayReflections = reflections
    .filter(r => r.completedOn === dateStr && byId.has(r.taskId))
    .map(r => ({ ...r, taskName: byId.get(r.taskId)!.name }));

  return {
    date: dateStr,
    estimatedMs,
    ...mapPriority(project.priority),
    status,
    tracker,
    trackerTotal,
    log,
    summary: {
      focusedMs,
      breakMs,
      drainMs,
      workMs,
      efficiency: workMs > 0 ? Math.round((focusedMs / workMs) * 100) : null,
      biggestDrain,
      boost: boost && boost.ms > 0 ? boost : null,
      focusBreaks,
    },
    reflections: dayReflections,
  };
}

export interface ProjectDay {
  date: string;
  focusedMs: number;
  completed: number;
}

/**
 * Every day a project was worked on or had a task finished, newest first:
 * the project's history, and the totals the Projects page and the overview
 * read. A task's finishing day is the day its reflection was written for,
 * else the day it was planned for.
 */
export function projectDays(input: {
  projectId: string;
  tasks: SheetTask[];
  events: SheetEvent[];
  sessions: ActivityLike[];
  reflections?: SheetReflection[];
  timezone: string;
  now?: Date;
}): ProjectDay[] {
  const { timezone } = input;
  const now = input.now ?? new Date();
  const tasks = projectTasksOf(input.projectId, input.tasks);
  const ids = new Set(tasks.map(t => t.id));
  const away = awayCovers(input.sessions, now).all;
  const doneOn = new Map((input.reflections || []).map(r => [r.taskId, r.completedOn]));

  const events = input.events.filter(e => e.taskId && ids.has(e.taskId));
  const days = new Set<string>();
  for (const e of events) {
    const d = localDay(e.start, timezone);
    if (d && (e.completed || new Date(e.start) <= now)) days.add(d);
  }
  const completedOn = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'COMPLETED') continue;
    const d = doneOn.get(t.id) ?? localDay(t.date, timezone);
    if (!d) continue;
    days.add(d);
    completedOn.set(d, (completedOn.get(d) || 0) + 1);
  }

  const out: ProjectDay[] = [];
  for (const date of days) {
    const work = workOnDay(date, tasks, events, timezone, now);
    const focusedMs = spanMs(subtractIntervals(mergeSpans(work), away));
    const completed = completedOn.get(date) || 0;
    if (focusedMs > 0 || completed > 0) out.push({ date, focusedMs, completed });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

