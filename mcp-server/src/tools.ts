import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RuneApiError, type RuneClient } from './client.js';
import { addDays, DATE_RE, localDate, localTime, TIME_RE, todayIn, weekdayShort, zonedToUtc } from './time.js';

const CHARACTER_LIMIT = 25_000;

const DateStr = z.string().regex(DATE_RE, 'Use YYYY-MM-DD, e.g. 2026-09-19');
const TimeStr = z.string().regex(TIME_RE, 'Use 24-hour HH:MM, e.g. 14:30');
const Priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const TaskStatus = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']);
const SessionType = z.enum(['DEEP_WORK', 'FOCUS', 'REGULAR']);
const Format = z.enum(['markdown', 'json']).default('markdown').describe("'markdown' (default, human-readable) or 'json'");

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

// ---- Rune API row shapes (only the fields these tools read) ----------------

interface ApiTask {
  id: string; name: string; detail?: string | null; notes?: string | null; projectId?: string | null;
  priority: string; status: string; date: string; sessionType: string; estimatedTime: number; actualTime: number;
  startTime?: string | null; endTime?: string | null; blockedReason?: string | null; blockedOnName?: string | null;
  postponeHistory?: string | null;
}
interface ApiEvent {
  id: string; title: string; start: string; end: string; description?: string | null; sessionType?: string;
  taskId?: string | null; completed: boolean;
}
interface ApiProject {
  id: string; name: string; status: string; priority: string; deadline?: string | null; progress: number;
  tasksCompleted: number; tasksRemaining: number; description?: string | null;
}

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

function text(t: string): Result {
  const out = t.length > CHARACTER_LIMIT ? `${t.slice(0, CHARACTER_LIMIT)}\n\n…truncated. Narrow the request (date range, filters) or use limit/offset.` : t;
  return { content: [{ type: 'text', text: out }] };
}
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const render = (format: 'markdown' | 'json', data: unknown, md: () => string) => (format === 'json' ? json(data) : text(md()));

function fail(err: unknown): Result {
  const message = err instanceof RuneApiError ? err.message : err instanceof Error ? `Unexpected error: ${err.message}` : 'Unexpected error.';
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ---- shaping ---------------------------------------------------------------

function taskView(t: ApiTask, tz: string, projectName?: string) {
  return {
    id: t.id,
    name: t.name,
    date: localDate(t.date, tz),
    status: t.status,
    priority: t.priority,
    session_type: t.sessionType,
    estimated_hours: t.estimatedTime,
    actual_hours: Math.round(t.actualTime * 100) / 100,
    project: projectName ?? null,
    project_id: t.projectId ?? null,
    start_time: t.startTime ?? null,
    end_time: t.endTime ?? null,
    detail: t.detail || null,
    notes: t.notes || null,
    blocked_reason: t.status === 'BLOCKED' ? t.blockedReason ?? null : null,
  };
}
type TaskV = ReturnType<typeof taskView>;

const box = (s: string) => (s === 'COMPLETED' ? '[x]' : s === 'IN_PROGRESS' ? '[~]' : s === 'BLOCKED' ? '[!]' : '[ ]');

function taskLine(t: TaskV): string {
  const bits = [t.date, t.priority, `${t.estimated_hours}h`, t.session_type === 'REGULAR' ? '' : t.session_type.toLowerCase().replace('_', ' '), t.project ?? '', t.start_time && t.end_time ? `${t.start_time}–${t.end_time}` : ''].filter(Boolean);
  const blocked = t.blocked_reason ? ` (blocked: ${t.blocked_reason})` : '';
  return `- ${box(t.status)} **${t.name}**: ${bits.join(' · ')}${blocked} \`${t.id}\``;
}

function eventView(e: ApiEvent, tz: string) {
  return {
    id: e.id,
    title: e.title,
    date: localDate(e.start, tz),
    start_time: localTime(e.start, tz),
    end_time: localTime(e.end, tz),
    session_type: e.sessionType ?? 'REGULAR',
    completed: e.completed,
    task_id: e.taskId ?? null,
    description: e.description || null,
  };
}
type EventV = ReturnType<typeof eventView>;

const eventLine = (e: EventV) =>
  `- ${e.start_time}–${e.end_time} · ${e.completed ? '✅ ' : ''}**${e.title}**${e.session_type !== 'REGULAR' ? ` (${e.session_type.toLowerCase().replace('_', ' ')})` : ''} \`${e.id}\`${e.task_id ? ` (task \`${e.task_id}\`)` : ''}`;

async function loadContext(client: RuneClient) {
  // Sequential on purpose: a single-connection dev database (pglite) drops
  // connections under bursts, and one user's chat traffic is low-volume anyway.
  const user = await client.me();
  const tasks = await client.request<ApiTask[]>('GET', '/api/tasks');
  const projects = await client.request<ApiProject[]>('GET', '/api/projects');
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  return { tz: user.timezone || 'UTC', tasks, projects, projectNames };
}

async function findTask(client: RuneClient, taskId: string): Promise<ApiTask> {
  const tasks = await client.request<ApiTask[]>('GET', '/api/tasks');
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new RuneApiError(`Task ${taskId} was not found among your tasks. Use rune_list_tasks to find the correct id.`, 404);
  return task;
}

// ---- registration ----------------------------------------------------------

export function registerTools(server: McpServer, client: RuneClient): void {
  // Wraps every handler so any failure becomes an actionable isError result.
  function tool<S extends z.ZodObject>(
    name: string,
    title: string,
    description: string,
    schema: S,
    annotations: typeof READ | typeof WRITE | typeof UPDATE | typeof DELETE,
    handler: (args: z.infer<S>) => Promise<Result>
  ) {
    // The SDK's callback type is inferred per-schema and can't be expressed
    // through this generic wrapper; args are already validated against `schema`.
    const callback = async (args: z.infer<S>) => {
      try {
        return await handler(args);
      } catch (err) {
        return fail(err);
      }
    };
    server.registerTool(name, { title, description, inputSchema: schema, annotations }, callback as never);
  }

  tool('rune_whoami', 'Who Am I', 'Returns the Rune account this connection acts as, including its timezone (all dates/times in these tools are in this timezone) and today\'s date there. Call this first if unsure which account or "today" is meant.',
    z.object({}).strict(), READ, async () => {
      const u = await client.me();
      const tz = u.timezone || 'UTC';
      return json({ id: u.id, name: u.name, email: u.email, timezone: tz, today: todayIn(tz) });
    });

  tool('rune_get_schedule', 'Get Schedule',
    `Get the user's agenda for one or more days: calendar time blocks in order, plus tasks due that day that have no time block yet ("unscheduled"). Use this for "what's my day / week look like?".

Args:
  - date (YYYY-MM-DD, optional): first day, default today in the user's timezone
  - days (1-14): how many consecutive days, default 1`,
    z.object({ date: DateStr.optional(), days: z.number().int().min(1).max(14).default(1), response_format: Format }).strict(), READ,
    async ({ date, days, response_format }) => {
      const { tz, tasks, projectNames } = await loadContext(client);
      const events = await client.request<ApiEvent[]>('GET', '/api/calendar');
      const start = date ?? todayIn(tz);
      const eventViews = events.map((e) => eventView(e, tz));
      const taskViews = tasks.map((t) => taskView(t, tz, t.projectId ? projectNames.get(t.projectId) : undefined));
      const scheduledTaskIds = new Set(eventViews.map((e) => e.task_id).filter(Boolean));

      const agenda = Array.from({ length: days }, (_, i) => {
        const day = addDays(start, i);
        return {
          date: day,
          events: eventViews.filter((e) => e.date === day).sort((a, b) => a.start_time.localeCompare(b.start_time)),
          unscheduled_tasks: taskViews.filter((t) => t.date === day && !scheduledTaskIds.has(t.id) && t.status !== 'COMPLETED'),
        };
      });
      return render(response_format, { timezone: tz, agenda }, () =>
        agenda
          .map((d) => {
            const lines = [`## ${weekdayShort(d.date)} ${d.date}`];
            if (d.events.length === 0 && d.unscheduled_tasks.length === 0) lines.push('_Nothing scheduled._');
            lines.push(...d.events.map(eventLine));
            if (d.unscheduled_tasks.length) lines.push('**Unscheduled tasks:**', ...d.unscheduled_tasks.map(taskLine));
            return lines.join('\n');
          })
          .join('\n\n')
      );
    });

  tool('rune_list_tasks', 'List Tasks',
    `List the user's tasks with optional filters, soonest first. All filters combine with AND.

Args:
  - status: PENDING | IN_PROGRESS | COMPLETED | BLOCKED
  - date: only tasks on this exact day (YYYY-MM-DD); or from_date/to_date for an inclusive range
  - overdue: true = only not-completed tasks dated before today
  - project_id, priority, search (matches name/detail)
  - limit (1-100, default 20), offset (pagination)`,
    z.object({
      status: TaskStatus.optional(), date: DateStr.optional(), from_date: DateStr.optional(), to_date: DateStr.optional(),
      overdue: z.boolean().optional(), project_id: z.string().optional(), priority: Priority.optional(),
      search: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0), response_format: Format,
    }).strict(), READ,
    async (a) => {
      const { tz, tasks, projectNames } = await loadContext(client);
      const today = todayIn(tz);
      const q = a.search?.toLowerCase();
      const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const matches = tasks
        .map((t) => taskView(t, tz, t.projectId ? projectNames.get(t.projectId) : undefined))
        .filter((t) =>
          (!a.status || t.status === a.status) &&
          (!a.date || t.date === a.date) &&
          (!a.from_date || t.date >= a.from_date) &&
          (!a.to_date || t.date <= a.to_date) &&
          (!a.overdue || (t.date < today && t.status !== 'COMPLETED')) &&
          (!a.project_id || t.project_id === a.project_id) &&
          (!a.priority || t.priority === a.priority) &&
          (!q || t.name.toLowerCase().includes(q) || (t.detail ?? '').toLowerCase().includes(q))
        )
        .sort((x, y) => x.date.localeCompare(y.date) || (rank[x.priority] ?? 9) - (rank[y.priority] ?? 9));
      const page = matches.slice(a.offset, a.offset + a.limit);
      const has_more = a.offset + page.length < matches.length;
      const out = { total: matches.length, count: page.length, offset: a.offset, has_more, next_offset: has_more ? a.offset + page.length : null, tasks: page };
      return render(a.response_format, out, () =>
        matches.length === 0 ? 'No tasks match those filters.'
          : `${matches.length} task(s)${has_more ? `. Showing ${a.offset + 1}–${a.offset + page.length}, next_offset=${a.offset + page.length}` : ''}\n\n${page.map(taskLine).join('\n')}`
      );
    });

  tool('rune_create_task', 'Create Task',
    `Create a task. Optionally reserve a time block on the calendar by giving BOTH start_time and end_time.

Args:
  - name (required), date (YYYY-MM-DD, default today), detail, project_id, priority (default MEDIUM), session_type (DEEP_WORK | FOCUS | REGULAR), estimated_hours (default 1)
  - start_time + end_time (24h HH:MM, user's timezone): also books a calendar block that day`,
    z.object({
      name: z.string().trim().min(1).max(500), date: DateStr.optional(), detail: z.string().max(10_000).optional(),
      project_id: z.string().optional(), priority: Priority.default('MEDIUM'), session_type: SessionType.optional(),
      estimated_hours: z.number().min(0.25).max(24).optional(), start_time: TimeStr.optional(), end_time: TimeStr.optional(),
    }).strict().refine((v) => !!v.start_time === !!v.end_time, { message: 'Provide both start_time and end_time, or neither.' }), WRITE,
    async (a) => {
      const user = await client.me();
      const tz = user.timezone || 'UTC';
      const created = await client.request<ApiTask>('POST', '/api/tasks', {
        name: a.name, date: a.date ?? todayIn(tz), detail: a.detail, projectId: a.project_id, priority: a.priority,
        sessionType: a.session_type, estimatedTime: a.estimated_hours, status: 'PENDING',
        slots: a.start_time && a.end_time ? [{ startTime: a.start_time, endTime: a.end_time }] : undefined,
      });
      return text(`Created task:\n${taskLine(taskView(created, tz))}`);
    });

  tool('rune_update_task', 'Update Task',
    `Edit an existing task. Only the fields you pass change. To move a task to another day prefer rune_reschedule_task (it records the postponement). To finish a task prefer rune_complete_task.

Args:
  - task_id (required, from rune_list_tasks)
  - name, detail, notes, priority, status (PENDING | IN_PROGRESS | COMPLETED | BLOCKED), session_type, estimated_hours, project_id (null to unlink)
  - blocked_reason: why it is blocked (only used with status BLOCKED)
  - start_time + end_time: (re)book the calendar block on the task's day`,
    z.object({
      task_id: z.string().min(1), name: z.string().trim().min(1).max(500).optional(), detail: z.string().max(10_000).nullable().optional(),
      notes: z.string().max(10_000).nullable().optional(), priority: Priority.optional(), status: TaskStatus.optional(),
      session_type: SessionType.optional(), estimated_hours: z.number().min(0.25).max(24).optional(),
      project_id: z.string().nullable().optional(), blocked_reason: z.string().max(500).nullable().optional(),
      start_time: TimeStr.optional(), end_time: TimeStr.optional(),
    }).strict().refine((v) => !!v.start_time === !!v.end_time, { message: 'Provide both start_time and end_time, or neither.' }), UPDATE,
    async (a) => {
      const user = await client.me();
      const updated = await client.request<ApiTask>('PUT', `/api/tasks/${encodeURIComponent(a.task_id)}`, {
        name: a.name, detail: a.detail, notes: a.notes, priority: a.priority, status: a.status, sessionType: a.session_type,
        estimatedTime: a.estimated_hours, projectId: a.project_id, blockedReason: a.blocked_reason,
        slots: a.start_time && a.end_time ? [{ startTime: a.start_time, endTime: a.end_time }] : undefined,
      });
      return text(`Updated task:\n${taskLine(taskView(updated, user.timezone || 'UTC'))}`);
    });

  tool('rune_complete_task', 'Complete Task', 'Mark a task as done. Any calendar block linked to it is marked completed too.',
    z.object({ task_id: z.string().min(1) }).strict(), UPDATE, async ({ task_id }) => {
      const user = await client.me();
      const updated = await client.request<ApiTask>('PUT', `/api/tasks/${encodeURIComponent(task_id)}`, { status: 'COMPLETED' });
      return text(`Marked complete:\n${taskLine(taskView(updated, user.timezone || 'UTC'))}`);
    });

  tool('rune_reschedule_task', 'Reschedule Task',
    `Move a task to a different day, keeping its time-of-day block. Records the move in the task's postponement history (used by Rune's analytics), so use this instead of rune_update_task for date changes.

Args: task_id, new_date (YYYY-MM-DD), reason (optional)`,
    z.object({ task_id: z.string().min(1), new_date: DateStr, reason: z.string().max(300).optional() }).strict(), UPDATE,
    async ({ task_id, new_date, reason }) => {
      const user = await client.me();
      const current = (await client.request<ApiTask[]>('GET', '/api/tasks')).find((t) => t.id === task_id);
      if (!current) throw new RuneApiError(`Task ${task_id} was not found among your tasks. Use rune_list_tasks to find the correct id.`, 404);
      let history: unknown[] = [];
      try {
        const parsed = current.postponeHistory ? JSON.parse(current.postponeHistory) : [];
        if (Array.isArray(parsed)) history = parsed;
      } catch { /* start a fresh history */ }
      history.push({ originalDate: current.date, newDate: new_date, reason: reason || undefined, movedAt: new Date().toISOString() });
      const updated = await client.request<ApiTask>('PUT', `/api/tasks/${encodeURIComponent(task_id)}`, { date: new_date, postponeHistory: JSON.stringify(history) });
      return text(`Rescheduled:\n${taskLine(taskView(updated, user.timezone || 'UTC'))}`);
    });

  tool('rune_delete_task', 'Delete Task', 'Permanently delete a task and its linked calendar blocks. This cannot be undone - confirm with the user first unless they clearly asked for deletion.',
    z.object({ task_id: z.string().min(1) }).strict(), DELETE, async ({ task_id }) => {
      const task = await findTask(client, task_id);
      await client.request('DELETE', `/api/tasks/${encodeURIComponent(task_id)}`);
      return text(`Deleted task "${task.name}" (\`${task_id}\`).`);
    });

  tool('rune_list_projects', 'List Projects', 'List the user\'s projects (including team projects they can see) with status, priority, deadline and progress. Use the ids with the task tools.',
    z.object({ status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(), response_format: Format }).strict(), READ,
    async ({ status, response_format }) => {
      const { tz, projects } = await loadContext(client);
      const rows = projects.filter((p) => !status || p.status === status).map((p) => ({
        id: p.id, name: p.name, status: p.status, priority: p.priority, deadline: p.deadline ? localDate(p.deadline, tz) : null,
        progress_percent: Math.round(p.progress), tasks_completed: p.tasksCompleted, tasks_remaining: p.tasksRemaining,
      }));
      return render(response_format, { projects: rows }, () =>
        rows.length === 0 ? 'No projects.' : rows.map((p) => `- **${p.name}**: ${p.status} · ${p.priority} · ${p.progress_percent}% (${p.tasks_completed} done, ${p.tasks_remaining} left)${p.deadline ? ` · due ${p.deadline}` : ''} \`${p.id}\``).join('\n'));
    });

  tool('rune_create_project', 'Create Project', 'Create a personal project. Returns its id for use with rune_create_task.',
    z.object({ name: z.string().trim().min(1).max(300), description: z.string().max(10_000).optional(), deadline: DateStr.optional(), priority: Priority.default('MEDIUM') }).strict(), WRITE,
    async (a) => {
      const p = await client.request<ApiProject>('POST', '/api/projects', { name: a.name, description: a.description, deadline: a.deadline, priority: a.priority, status: 'ACTIVE' });
      return text(`Created project **${p.name}** \`${p.id}\`.`);
    });

  tool('rune_list_calendar_events', 'List Calendar Events', 'List calendar time blocks between two days (inclusive), in order. Defaults to the next 7 days.',
    z.object({ from_date: DateStr.optional(), to_date: DateStr.optional(), response_format: Format }).strict(), READ,
    async ({ from_date, to_date, response_format }) => {
      const user = await client.me();
      const tz = user.timezone || 'UTC';
      const from = from_date ?? todayIn(tz);
      const to = to_date ?? addDays(from, 6);
      const events = (await client.request<ApiEvent[]>('GET', '/api/calendar')).map((e) => eventView(e, tz))
        .filter((e) => e.date >= from && e.date <= to)
        .sort((x, y) => x.date.localeCompare(y.date) || x.start_time.localeCompare(y.start_time));
      return render(response_format, { timezone: tz, from, to, events }, () => {
        if (events.length === 0) return `No calendar events from ${from} to ${to}.`;
        const days = [...new Set(events.map((e) => e.date))];
        return days.map((d) => `## ${weekdayShort(d)} ${d}\n${events.filter((e) => e.date === d).map(eventLine).join('\n')}`).join('\n\n');
      });
    });

  const eventTimes = (date: string, start: string, end: string, tz: string) => {
    const s = zonedToUtc(date, start, tz);
    let e = zonedToUtc(date, end, tz);
    if (e <= s) e = new Date(e.getTime() + 86_400_000); // overnight, same rule as the Rune app
    return { start: s.toISOString(), end: e.toISOString() };
  };

  tool('rune_create_calendar_event', 'Create Calendar Event',
    `Add a time block to the calendar (a meeting, a focus session, an appointment). For work that is a to-do, use rune_create_task with start_time/end_time instead.

Args: title, date (YYYY-MM-DD), start_time + end_time (24h HH:MM in the user's timezone; an end before the start means it runs past midnight), description, session_type, task_id (link to a task)`,
    z.object({ title: z.string().trim().min(1).max(500), date: DateStr, start_time: TimeStr, end_time: TimeStr, description: z.string().max(10_000).optional(), session_type: SessionType.optional(), task_id: z.string().optional() }).strict(), WRITE,
    async (a) => {
      const user = await client.me();
      const tz = user.timezone || 'UTC';
      const created = await client.request<ApiEvent>('POST', '/api/calendar', {
        title: a.title, ...eventTimes(a.date, a.start_time, a.end_time, tz), description: a.description, sessionType: a.session_type, taskId: a.task_id,
      });
      return text(`Created event:\n${eventLine(eventView(created, tz))}`);
    });

  tool('rune_update_calendar_event', 'Update Calendar Event',
    `Edit a calendar block. Only the fields you pass change. Giving only date moves the block to that day at the same times; giving only start_time keeps its duration.

Args: event_id (from rune_get_schedule / rune_list_calendar_events), title, description, date, start_time, end_time, completed`,
    z.object({ event_id: z.string().min(1), title: z.string().trim().min(1).max(500).optional(), description: z.string().max(10_000).nullable().optional(), date: DateStr.optional(), start_time: TimeStr.optional(), end_time: TimeStr.optional(), completed: z.boolean().optional() }).strict(), UPDATE,
    async (a) => {
      const user = await client.me();
      const tz = user.timezone || 'UTC';
      let times: { start?: string; end?: string } = {};
      if (a.date || a.start_time || a.end_time) {
        const events = await client.request<ApiEvent[]>('GET', '/api/calendar');
        const cur = events.find((e) => e.id === a.event_id);
        if (!cur) throw new RuneApiError(`Event ${a.event_id} was not found. Use rune_list_calendar_events to find the correct id.`, 404);
        const date = a.date ?? localDate(cur.start, tz);
        const start = a.start_time ?? localTime(cur.start, tz);
        const durationMs = new Date(cur.end).getTime() - new Date(cur.start).getTime();
        times = a.end_time
          ? eventTimes(date, start, a.end_time, tz)
          : (() => { const s = zonedToUtc(date, start, tz); return { start: s.toISOString(), end: new Date(s.getTime() + durationMs).toISOString() }; })();
      }
      const updated = await client.request<ApiEvent>('PUT', '/api/calendar', { id: a.event_id, title: a.title, description: a.description, completed: a.completed, ...times });
      return text(`Updated event:\n${eventLine(eventView(updated, tz))}`);
    });

  tool('rune_delete_calendar_event', 'Delete Calendar Event', 'Permanently delete a calendar block. Confirm with the user first unless they clearly asked for deletion.',
    z.object({ event_id: z.string().min(1) }).strict(), DELETE, async ({ event_id }) => {
      await client.request('DELETE', `/api/calendar?id=${encodeURIComponent(event_id)}`);
      return text(`Deleted calendar event \`${event_id}\`.`);
    });

  tool('rune_get_weekly_digest', 'Get Weekly Digest', 'Summary of last week (tasks completed, deep-work hours), what is coming this week (tasks due, project deadlines) and blocked work.',
    z.object({ response_format: Format }).strict(), READ, async ({ response_format }) => {
      const d = await client.request<{
        weekOf: string; lastWeek: { completedTasks: number; deepWorkHours: number };
        weekAhead: { tasksDue: number; projectDeadlines: { name: string; deadline: string }[] }; blocked: { mine: number; onMe: number };
      }>('GET', '/api/digest/weekly');
      return render(response_format, d, () => [
        `## Week of ${d.weekOf}`,
        `**Last week:** ${d.lastWeek.completedTasks} tasks completed, ${d.lastWeek.deepWorkHours}h deep work`,
        `**This week:** ${d.weekAhead.tasksDue} tasks due${d.weekAhead.projectDeadlines.length ? `; deadlines: ${d.weekAhead.projectDeadlines.map((p) => `${p.name} (${p.deadline.slice(0, 10)})`).join(', ')}` : ''}`,
        `**Blocked:** ${d.blocked.mine} of yours, ${d.blocked.onMe} waiting on you`,
      ].join('\n'));
    });

  tool('rune_list_jobs', 'List Jobs', 'List tracked long-running jobs (compute runs, instrument runs) with status and projected completion. Read-only.',
    z.object({ status: z.string().max(50).optional(), response_format: Format }).strict(), READ, async ({ status, response_format }) => {
      const user = await client.me();
      const tz = user.timezone || 'UTC';
      const jobs = await client.request<{ id: string; name: string; status: string; category: string; submitTime: string; projectedCompletionTime?: string | null; instrument?: { name: string } | null }[]>('GET', '/api/jobs');
      const rows = jobs.filter((j) => !status || j.status.toLowerCase() === status.toLowerCase()).map((j) => ({
        id: j.id, name: j.name, status: j.status, category: j.category, instrument: j.instrument?.name ?? null,
        submitted: `${localDate(j.submitTime, tz)} ${localTime(j.submitTime, tz)}`,
        projected_completion: j.projectedCompletionTime ? `${localDate(j.projectedCompletionTime, tz)} ${localTime(j.projectedCompletionTime, tz)}` : null,
      }));
      return render(response_format, { jobs: rows }, () =>
        rows.length === 0 ? 'No jobs.' : rows.map((j) => `- **${j.name}**: ${j.status} · ${j.category}${j.instrument ? ` · ${j.instrument}` : ''} · submitted ${j.submitted}${j.projected_completion ? ` · ETA ${j.projected_completion}` : ''} \`${j.id}\``).join('\n'));
    });
}
