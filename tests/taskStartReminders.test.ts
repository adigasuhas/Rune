import { describe, expect, it } from 'vitest';
import {
  dueStartReminders,
  isStartReminderCurrent,
  nextStartAt,
  parseStartReminderKey,
  startReminderKey,
} from '@/lib/taskStartReminders';

const TZ = 'Asia/Kolkata';
const at = (local: string) => new Date(`${local}:00+05:30`);
const slot = (taskId: string, s: string, e: string, completed = false) => ({ taskId, start: at(s).toISOString(), end: at(e).toISOString(), completed });
const task = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Task ${id}`, status: 'PENDING', date: at('2026-10-16T00:00').toISOString(), ...over });

describe('start reminders - when they are due', () => {
  const events = [slot('a', '2026-10-16T10:00', '2026-10-16T11:00')];

  it('nothing before the start; due at the start; not after the slot ends', () => {
    expect(dueStartReminders([task('a')], events, TZ, at('2026-10-16T09:59'))).toEqual([]);
    const due = dueStartReminders([task('a')], events, TZ, at('2026-10-16T10:00'));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ taskId: 'a', late: false, key: startReminderKey('a', at('2026-10-16T10:00')) });
    expect(dueStartReminders([task('a')], events, TZ, at('2026-10-16T11:00'))).toEqual([]);
  });

  it('missed policy: opening mid-slot shows it once, marked late', () => {
    const due = dueStartReminders([task('a')], events, TZ, at('2026-10-16T10:40'));
    expect(due[0].late).toBe(true);
    // Same occurrence, same key -> the server's unique dedupeKey keeps it to one notification.
    expect(due[0].key).toBe(dueStartReminders([task('a')], events, TZ, at('2026-10-16T10:00'))[0].key);
  });

  it('only To do tasks: in progress, done, blocked, unaccepted or declined get none', () => {
    for (const over of [{ status: 'IN_PROGRESS' }, { status: 'COMPLETED' }, { status: 'BLOCKED' }, { assignmentStatus: 'PENDING_ACCEPTANCE' }, { assignmentStatus: 'DECLINED' }]) {
      expect(dueStartReminders([task('a', over)], events, TZ, at('2026-10-16T10:01'))).toEqual([]);
    }
  });

  it('a task with no time slot gets no reminder', () => {
    expect(dueStartReminders([task('a')], [], TZ, at('2026-10-16T10:01'))).toEqual([]);
  });

  it('uses the task\'s own start/end when it has no calendar slots', () => {
    const t = task('a', { startTime: '14:00', endTime: '15:00' });
    expect(dueStartReminders([t], [], TZ, at('2026-10-16T14:00'))).toHaveLength(1);
  });

  it('several tasks at the same time each get their own reminder', () => {
    const ev = ['a', 'b', 'c'].map((id) => slot(id, '2026-10-16T10:00', '2026-10-16T10:30'));
    const due = dueStartReminders([task('a'), task('b'), task('c')], ev, TZ, at('2026-10-16T10:00'));
    expect(due.map((d) => d.taskId).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(due.map((d) => d.key)).size).toBe(3);
  });

  it('a ticked-off slot does not remind; the task\'s next slot does', () => {
    const ev = [slot('a', '2026-10-16T09:00', '2026-10-16T09:30', true), slot('a', '2026-10-16T15:00', '2026-10-16T16:00')];
    expect(dueStartReminders([task('a')], ev, TZ, at('2026-10-16T09:10'))).toEqual([]);
    expect(dueStartReminders([task('a')], ev, TZ, at('2026-10-16T15:00'))).toHaveLength(1);
  });

  it('across midnight: a 23:50 slot is due at 23:50 and still due at 00:05', () => {
    const ev = [slot('a', '2026-10-16T23:50', '2026-10-17T00:30')];
    expect(dueStartReminders([task('a')], ev, TZ, at('2026-10-16T23:50'))).toHaveLength(1);
    expect(dueStartReminders([task('a')], ev, TZ, at('2026-10-17T00:05'))[0].late).toBe(true);
  });

  it('time zones: the same instant is "now" for the account zone, not the browser', () => {
    const ny = 'America/New_York';
    const t = { id: 'n', name: 'NY', status: 'PENDING', date: '2026-10-16T04:00:00.000Z', startTime: '09:00', endTime: '10:00' };
    expect(dueStartReminders([t], [], ny, new Date('2026-10-16T13:00:00Z'))).toHaveLength(1); // 09:00 EDT
    expect(dueStartReminders([t], [], ny, new Date('2026-10-16T09:00:00Z'))).toEqual([]); // 05:00 EDT
  });
});

describe('start reminders - obsolete ones are withdrawn', () => {
  const key = startReminderKey('a', at('2026-10-16T10:00'));
  const events = [slot('a', '2026-10-16T10:00', '2026-10-16T11:00')];
  const now = at('2026-10-16T10:05');

  it('current while the task is pending and the slot unchanged', () => {
    expect(isStartReminderCurrent(key, [task('a')], events, TZ, now)).toBe(true);
  });

  it('obsolete once started, done, blocked, deleted, or the slot is over', () => {
    expect(isStartReminderCurrent(key, [task('a', { status: 'IN_PROGRESS' })], events, TZ, now)).toBe(false);
    expect(isStartReminderCurrent(key, [task('a', { status: 'COMPLETED' })], events, TZ, now)).toBe(false);
    expect(isStartReminderCurrent(key, [task('a', { status: 'BLOCKED' })], events, TZ, now)).toBe(false);
    expect(isStartReminderCurrent(key, [], events, TZ, now)).toBe(false);
    expect(isStartReminderCurrent(key, [task('a')], events, TZ, at('2026-10-16T11:00'))).toBe(false);
  });

  it('rescheduled (or postponed to another day): the old key is obsolete and the new time gets a new key', () => {
    const moved = [slot('a', '2026-10-17T10:00', '2026-10-17T11:00')];
    expect(isStartReminderCurrent(key, [task('a')], moved, TZ, now)).toBe(false);
    expect(dueStartReminders([task('a')], moved, TZ, now)).toEqual([]);
    const due = dueStartReminders([task('a')], moved, TZ, at('2026-10-17T10:00'));
    expect(due[0].key).not.toBe(key);
  });

  it('keys round-trip', () => {
    expect(parseStartReminderKey(key)).toEqual({ taskId: 'a', start: at('2026-10-16T10:00').toISOString() });
    expect(parseStartReminderKey('task:a:upcoming:2026-10-16')).toBeNull();
  });
});

describe('nextStartAt', () => {
  it('the next pending start after now, ignoring started/done tasks', () => {
    const ev = [slot('a', '2026-10-16T12:00', '2026-10-16T13:00'), slot('b', '2026-10-16T11:00', '2026-10-16T12:00')];
    const now = at('2026-10-16T10:00');
    expect(nextStartAt([task('a'), task('b')], ev, TZ, now)).toEqual(at('2026-10-16T11:00'));
    expect(nextStartAt([task('a'), task('b', { status: 'IN_PROGRESS' })], ev, TZ, now)).toEqual(at('2026-10-16T12:00'));
    expect(nextStartAt([], ev, TZ, now)).toBeNull();
  });
});
