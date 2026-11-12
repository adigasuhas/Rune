'use client';

import { withoutCancelled } from '@/lib/taskCancel';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { startVisiblePolling } from '@/lib/visiblePolling';
import { nextStartAt, parseStartReminderKey } from '@/lib/taskStartReminders';
import type { AutoStarted } from '@/lib/taskAutoStart';

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  /** Buttons on the toast (e.g. "Start task"). A toast with actions stays until one is used or it's closed. */
  actions?: ToastAction[];
}

interface ToastOptions {
  /** Stable id: a second toast with the same id is ignored. */
  id?: string;
  actions?: ToastAction[];
}

export interface NotificationItem {
  id: string;
  type: 'JOB_REMINDER' | 'JOB_RECURRING' | 'JOB_TERMINATION' | 'TASK_REMINDER' | 'RUN_APPROACHING_END' | 'RUN_OVERDUE' | 'TASK_BLOCKED' | 'WEEKLY_DIGEST' | 'NOTEBOOK_REVIEW_REQUESTED' | 'NOTEBOOK_COMMENT' | 'TASK_ASSIGNED' | 'TASK_ACCEPTED' | 'TASK_DECLINED' | 'TASK_CANCELLED' | 'CHAT_MENTION';
  title: string;
  body?: string | null;
  sourceType: 'Job' | 'Task' | 'Notebook' | 'Digest' | 'Team';
  sourceId?: string | null;
  read: boolean;
  dismissedAt?: string | null;
  dedupeKey?: string | null;
  createdAt: string;
}

interface NotifyInput {
  type: NotificationItem['type'];
  title: string;
  body?: string;
  sourceType: NotificationItem['sourceType'];
  sourceId?: string;
  dedupeKey: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  toasts: Toast[];
  toast: (title: string, message: string, type?: ToastType, options?: ToastOptions) => void;
  notify: (input: NotifyInput, toastOptions?: ToastOptions) => Promise<void>;
  /** "Undo" on a "Task started" notice: moves the task back to To do (it won't start again for that slot). */
  undoAutoStart: (dedupeKey: string) => Promise<void>;
  /** Clears a "Task started" notice; the task is left as it is. */
  dismissReminder: (dedupeKey: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const POLL_INTERVAL_MS = 30000;
const TASK_SCAN_INTERVAL_MS = 60000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const toastIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { toastIdsRef.current = new Set(toasts.map((t) => t.id)); }, [toasts]);
  const notificationsRef = useRef<NotificationItem[]>([]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const playChime = useCallback((type: ToastType) => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      const audioCtx = audioCtxRef.current;
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880.0, audioCtx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(440.0, audioCtx.currentTime);
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime + 0.12);
      }
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.warn('Web Audio check failed:', e);
    }
  }, []);

  const showBrowserNotification = useCallback((title: string, message: string) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body: message });
        }
      });
    }
  }, []);

  const toast = useCallback((title: string, message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = options?.id ?? Math.random().toString(36).substring(2, 9);
    if (toastIdsRef.current.has(id)) return;
    toastIdsRef.current.add(id);
    setToasts((prev) => [...prev, { id, title, message, type, actions: options?.actions }]);
    playChime(type);
    showBrowserNotification(title, message);
    // A toast that asks for a decision stays until it gets one.
    if (!options?.actions?.length) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    }
  }, [playChime, showBrowserNotification]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [user]);

  const notify = useCallback(async (input: NotifyInput, toastOptions?: ToastOptions) => {
    const typeToToast: Record<NotificationItem['type'], ToastType> = {
      JOB_REMINDER: 'warning',
      JOB_RECURRING: 'warning',
      JOB_TERMINATION: 'info',
      TASK_REMINDER: 'info',
      RUN_APPROACHING_END: 'warning',
      RUN_OVERDUE: 'error',
      TASK_BLOCKED: 'info',
      WEEKLY_DIGEST: 'info',
      NOTEBOOK_REVIEW_REQUESTED: 'info',
      NOTEBOOK_COMMENT: 'info',
      TASK_ASSIGNED: 'info',
      TASK_ACCEPTED: 'success',
      TASK_DECLINED: 'warning',
      TASK_CANCELLED: 'warning',
      CHAT_MENTION: 'info'
    };
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (res.ok) {
        const created = await res.json();
        // The user has this notification type turned off in Settings - not
        // an error, just nothing to show.
        if (created.skipped) return;
        // Only surface a toast/sound for a genuinely new notification (HTTP 201). A 200 means
        // the same dedupeKey already existed - e.g. this effect re-firing after a page reload -
        // and re-alerting for something already seen (or already dismissed) would be a regression.
        if (!created.dismissedAt) {
          setNotifications((prev) => (prev.some((n) => n.id === created.id) ? prev : [created, ...prev]));
        }
        if (res.status === 201) {
          toast(input.title, input.body || '', typeToToast[input.type], toastOptions);
        }
      }
    } catch (err) {
      console.error('Failed to create notification:', err);
    }
  }, [toast]);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true, dismissed: true })
      });
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }, []);

  const dismissAll = useCallback(async () => {
    const prev = notifications;
    setNotifications([]);
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' });
      if (!res.ok) setNotifications(prev);
    } catch (err) {
      console.error('Failed to dismiss all notifications:', err);
      setNotifications(prev);
    }
  }, [notifications]);

  // Poll the notification center list while logged in. ClientLayout redirects to /login (and
  // this provider's consumers unmount) once the session clears, so there's no stale-state case
  // to defend against here beyond simply not polling.
  useEffect(() => {
    if (!user) return;
    refresh();
    return startVisiblePolling(refresh, POLL_INTERVAL_MS);
  }, [user, refresh]);

  // --- "Time to get started": start reminders ---------------------------
  // Clears a start reminder everywhere: its toast, and its bell entry (on the
  // server too, so it doesn't come back on the next poll or another tab).
  const clearReminder = useCallback(async (dedupeKey: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== dedupeKey));
    let item = notificationsRef.current.find((n) => n.dedupeKey === dedupeKey);
    if (!item) {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) item = ((await res.json()) as NotificationItem[]).find((n) => n.dedupeKey === dedupeKey);
      } catch { /* offline - the next scan tidies up */ }
    }
    if (item) await dismiss(item.id);
  }, [dismiss]);

  const dismissReminder = useCallback((dedupeKey: string) => clearReminder(dedupeKey), [clearReminder]);

  const undoAutoStart = useCallback(async (dedupeKey: string) => {
    const parsed = parseStartReminderKey(dedupeKey);
    if (!parsed) return;
    try {
      // Re-check the task as it is NOW.
      const res = await fetch(`/api/tasks/${parsed.taskId}`);
      if (!res.ok) {
        await clearReminder(dedupeKey);
        toast('This task is gone', 'It was deleted, so there’s nothing to undo.', 'info');
        return;
      }
      const task = await res.json();
      if (task.status !== 'IN_PROGRESS') {
        await clearReminder(dedupeKey);
        const state = task.status === 'PENDING' ? 'already in To do' : task.status === 'COMPLETED' ? 'done' : task.status === 'BLOCKED' ? 'blocked' : 'no longer in progress';
        toast('Nothing to undo', `“${task.name}” is ${state}.`, 'info');
        return;
      }
      const put = await fetch(`/api/tasks/${parsed.taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' }),
      });
      if (!put.ok) {
        toast('Couldn’t move the task back', 'Try again.', 'error');
        return;
      }
      await clearReminder(dedupeKey);
      window.dispatchEvent(new CustomEvent('rune-tasks-changed'));
      toast('Back in To do', `“${task.name}” won’t start again until its next time slot.`, 'success');
    } catch (err) {
      console.error('Undoing an automatic start failed:', err);
      toast('Couldn’t move the task back', 'Try again.', 'error');
    }
  }, [clearReminder, toast]);

  // Watches for To do tasks reaching their scheduled start and moves them
  // to In progress (src/lib/taskAutoStart: once per slot, decided on the
  // server). This runs in the open app - a timer aimed at the next start, a
  // 60s safety scan, and a re-scan whenever the tab comes back into view.
  // Opened part-way through a slot, the task is started then; once the slot
  // is over, it's left alone.
  useEffect(() => {
    if (!user) return;
    let timer: number | undefined;
    let cancelled = false;

    const scan = async () => {
      window.clearTimeout(timer);
      try {
        const startRes = await fetch('/api/tasks/auto-start', { method: 'POST' });
        const started: AutoStarted[] = startRes.ok ? (await startRes.json()).started ?? [] : [];
        // Announce what was started even if this scan was superseded (an
        // effect re-run): the server won't report these tasks again.
        if (started.length > 0) {
          const tz = (await (await fetch('/api/settings')).json().catch(() => null))?.timezone || 'UTC';
          for (const r of started.filter((x) => x.notify)) {
            const at = new Date(r.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
            toast('Task started', r.late
              ? `“${r.name}” was scheduled for ${at}, so it’s now in progress.`
              : `“${r.name}” is scheduled now, so it’s in progress.`, 'info', {
              id: r.key,
              actions: [
                { label: 'Got it', primary: true, onClick: () => { void dismissReminder(r.key); } },
                { label: 'Undo', onClick: () => { void undoAutoStart(r.key); } },
              ],
            });
          }
          void refresh();
          window.dispatchEvent(new CustomEvent('rune-tasks-changed'));
        }

        // Aim the next look at the next start (to the second), never more
        // than a minute away so edits made elsewhere are picked up.
        const [tasksRes, settingsRes, eventsRes] = await Promise.all([fetch('/api/tasks'), fetch('/api/settings'), fetch('/api/calendar')]);
        if (!tasksRes.ok || cancelled) return;
        const tasks = withoutCancelled<any>(await tasksRes.json());
        const tz = (settingsRes.ok ? (await settingsRes.json())?.timezone : null) || 'UTC';
        const events = eventsRes.ok ? await eventsRes.json() : [];
        if (cancelled) return;
        const next = nextStartAt(tasks, events, tz, new Date());
        const wait = next ? Math.max(250, Math.min(TASK_SCAN_INTERVAL_MS, next.getTime() - Date.now() + 250)) : TASK_SCAN_INTERVAL_MS;
        timer = window.setTimeout(scan, wait);
      } catch (err) {
        console.error('Task auto-start scan failed:', err);
        if (!cancelled) timer = window.setTimeout(scan, TASK_SCAN_INTERVAL_MS);
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void scan(); };
    const onTasksChanged = () => { void scan(); };
    void scan();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('rune-tasks-changed', onTasksChanged);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('rune-tasks-changed', onTasksChanged);
    };
  }, [user, toast, refresh, undoAutoStart, dismissReminder]);

  return (
    <NotificationContext.Provider value={{ notifications, toasts, toast, notify, dismiss, dismissAll, dismissToast, refresh, undoAutoStart, dismissReminder }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
