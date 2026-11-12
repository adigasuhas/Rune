import { describe, it, expect } from 'vitest';
import { buildTimeSheet, projectDays } from '@/lib/projectTimeSheet';
import { projectEmphasis, tint } from '@/lib/projectEmphasis';

const at = (hhmm: string, day = '2026-11-10') => new Date(`${day}T${hhmm}:00Z`);
const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = at('20:00');

const project = { id: 'p', priority: 'CRITICAL' };
const tasks = [
  { id: 'a', name: 'Draft methods', projectId: 'p', status: 'COMPLETED', date: '2026-11-10T00:00:00Z', estimatedTime: 2, actualTime: 2 },
  { id: 'b', name: 'Make figures', projectId: 'p', status: 'IN_PROGRESS', date: '2026-11-10T00:00:00Z', estimatedTime: 1 },
  { id: 'c', name: 'Other project', projectId: 'q', status: 'COMPLETED', date: '2026-11-10T00:00:00Z', estimatedTime: 1, actualTime: 1 },
  { id: 'd', name: 'Dropped', projectId: 'p', status: 'CANCELLED', date: '2026-11-10T00:00:00Z', estimatedTime: 3 },
  { id: 'e', name: 'Yesterday', projectId: 'p', status: 'COMPLETED', date: '2026-11-09T00:00:00Z', estimatedTime: 1, actualTime: 1 },
];
const events = [
  { taskId: 'a', start: at('09:00'), end: at('11:00'), completed: true },
  { taskId: 'b', start: at('13:00'), end: at('14:00'), completed: true },
  { taskId: 'b', start: at('21:00'), end: at('22:00'), completed: false }, // later today, not work yet
  { taskId: 'c', start: at('15:00'), end: at('16:00'), completed: true },
  { taskId: 'e', start: at('23:30', '2026-11-09'), end: at('00:30'), completed: true }, // past midnight: belongs to the 9th
];
const sessions = [
  { kind: 'BREAK', start: at('10:00'), end: at('10:15') },
  { kind: 'BRAIN_DRAIN', start: at('10:30'), end: at('10:50') },
  { kind: 'BREAK', start: at('12:00'), end: at('12:30') }, // between tasks: not this project's
];
const reflections = [
  { taskId: 'a', completedOn: '2026-11-10', productiveMoment: 'First hour', lesson: 'Start earlier' },
  { taskId: 'c', completedOn: '2026-11-10', productiveMoment: 'Not this project' },
];

describe('project time sheet', () => {
  const sheet = buildTimeSheet({ project, tasks, events, sessions, reflections, dateStr: '2026-11-10', timezone: 'UTC', now: NOW });

  it('fills the header from the project and its tasks', () => {
    expect(sheet.priority).toBe('HIGH');
    expect(sheet.critical).toBe(true);
    expect(sheet.estimatedMs).toBe(3 * HOUR); // cancelled task left out
    expect(sheet.status).toBe('IN_PROGRESS');
  });

  it('lists only this project’s tasks for the day, with target, actual and difference', () => {
    expect(sheet.tracker.map(r => r.name)).toEqual(['Draft methods', 'Make figures']);
    const a = sheet.tracker[0];
    expect(a.targetMs).toBe(2 * HOUR);
    expect(a.actualMs).toBe(85 * MIN); // 2h less a 15m break and 20m of drift
    expect(a.diffMs).toBe(-35 * MIN);
    expect(sheet.trackerTotal.actualMs).toBe(145 * MIN);
  });

  it('logs each work session with its breaks, and never counts unstarted slots', () => {
    expect(sheet.log).toHaveLength(2);
    expect(sheet.log[0]).toMatchObject({ name: 'Draft methods', spentMs: 85 * MIN, breakMs: 15 * MIN, drainMs: 20 * MIN });
    expect(sheet.log[1]).toMatchObject({ name: 'Make figures', spentMs: HOUR, breakMs: 0 });
  });

  it('summarises focused, break and work time; efficiency; drain and boost', () => {
    const s = sheet.summary;
    expect(s.workMs).toBe(3 * HOUR);
    expect(s.breakMs).toBe(15 * MIN); // the 12:00 break was between tasks
    expect(s.drainMs).toBe(20 * MIN);
    expect(s.focusedMs).toBe(145 * MIN);
    expect(s.efficiency).toBe(81);
    expect(s.focusBreaks).toBe(1);
    expect(s.biggestDrain).toMatchObject({ ms: 20 * MIN, taskName: 'Draft methods' });
    expect(s.boost).toMatchObject({ ms: HOUR, taskName: 'Draft methods' });
  });

  it('shows the reflections written for this project that day only', () => {
    expect(sheet.reflections.map(r => r.taskName)).toEqual(['Draft methods']);
    expect(sheet.reflections[0].lesson).toBe('Start earlier');
  });

  it('keeps work past midnight on the day it started', () => {
    const ninth = buildTimeSheet({ project, tasks, events, sessions: [], reflections: [], dateStr: '2026-11-09', timezone: 'UTC', now: NOW });
    expect(ninth.trackerTotal.actualMs).toBe(HOUR);
    expect(ninth.status).toBe('COMPLETED');
  });

  it('follows a task moved to another project', () => {
    const moved = tasks.map(t => (t.id === 'a' ? { ...t, projectId: 'q' } : t));
    const s = buildTimeSheet({ project, tasks: moved, events, sessions, reflections, dateStr: '2026-11-10', timezone: 'UTC', now: NOW });
    expect(s.tracker.map(r => r.name)).toEqual(['Make figures']);
    expect(s.reflections).toHaveLength(0);
  });

  it('lists the project’s days, newest first', () => {
    const days = projectDays({ projectId: 'p', tasks, events, sessions, reflections, timezone: 'UTC', now: NOW });
    expect(days.map(d => d.date)).toEqual(['2026-11-10', '2026-11-09']);
    expect(days[0]).toMatchObject({ focusedMs: 145 * MIN, completed: 1 });
    expect(days[1]).toMatchObject({ focusedMs: HOUR, completed: 1 });
  });
});

describe('project emphasis', () => {
  it('puts priority on the edge and recent hours in the tint', () => {
    const urgentIdle = projectEmphasis('CRITICAL', 0, 20);
    const lowBusy = projectEmphasis('LOW', 20, 20);
    expect(urgentIdle.edgePct).toBeGreaterThan(lowBusy.edgePct);
    expect(urgentIdle.tintPct).toBe(0);
    expect(lowBusy.tintPct).toBeGreaterThan(urgentIdle.tintPct);
    expect(lowBusy.investmentSteps).toBe(4);
    expect(urgentIdle.investmentSteps).toBe(0);
  });

  it('normalises against the busiest project, with a floor so a few hours aren’t “full”', () => {
    expect(projectEmphasis('MEDIUM', 2, 2).investment).toBeCloseTo(Math.sqrt(0.2));
    expect(projectEmphasis('MEDIUM', 40, 40).investment).toBe(1);
    expect(projectEmphasis('MEDIUM', 10, 40).investment).toBeCloseTo(0.5);
  });

  it('mixes colours without assuming hex', () => {
    expect(tint('#336699', 12)).toBe('color-mix(in oklab, #336699 12%, transparent)');
    expect(tint(null, 50)).toContain('var(--border-strong)');
  });
});
