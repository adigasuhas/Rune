'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from '@/context/SessionContext';

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
}

export interface NotificationItem {
  id: string;
  type: 'JOB_REMINDER' | 'JOB_RECURRING' | 'JOB_TERMINATION' | 'TASK_REMINDER' | 'RUN_APPROACHING_END' | 'RUN_OVERDUE' | 'TASK_BLOCKED' | 'WEEKLY_DIGEST' | 'NOTEBOOK_REVIEW_REQUESTED' | 'NOTEBOOK_COMMENT' | 'TASK_ASSIGNED' | 'TASK_ACCEPTED' | 'TASK_DECLINED' | 'CHAT_MENTION';
  title: string;
  body?: string | null;
  sourceType: 'Job' | 'Task' | 'Notebook' | 'Digest' | 'Team';
  sourceId?: string | null;
  read: boolean;
  dismissedAt?: string | null;
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
  toast: (title: string, message: string, type?: ToastType) => void;
  notify: (input: NotifyInput) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const POLL_INTERVAL_MS = 30000;
const TASK_SCAN_INTERVAL_MS = 60000;
const TASK_REMINDER_LEAD_MINS = 10;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const notifiedTaskKeys = useRef<Set<string>>(new Set());

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

  const toast = useCallback((title: string, message: string, type: ToastType = 'info') => {
    playChime(type);
    showBrowserNotification(title, message);
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
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

  const notify = useCallback(async (input: NotifyInput) => {
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
          toast(input.title, input.body || '', typeToToast[input.type]);
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
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  // Lightweight scan for tasks whose scheduled start time is imminent today.
  useEffect(() => {
    if (!user) return;

    const scan = async () => {
      try {
        const [tasksRes, settingsRes] = await Promise.all([fetch('/api/tasks'), fetch('/api/settings')]);
        if (!tasksRes.ok) return;
        const tasks = await tasksRes.json();
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        if (settings && settings.taskNotificationsEnabled === false) return;

        const tz = settings?.timezone || 'UTC';
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
        const now = new Date();

        for (const task of tasks) {
          if (task.status === 'COMPLETED' || !task.startTime) continue;
          const taskDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(task.date));
          if (taskDateStr !== todayStr) continue;

          const [h, m] = task.startTime.split(':').map(Number);
          const startDate = new Date(`${todayStr}T00:00:00`);
          startDate.setHours(h, m, 0, 0);
          const minsUntilStart = (startDate.getTime() - now.getTime()) / 60000;

          const dedupeKey = `task:${task.id}:upcoming:${todayStr}`;
          if (minsUntilStart <= TASK_REMINDER_LEAD_MINS && minsUntilStart >= -1 && !notifiedTaskKeys.current.has(dedupeKey)) {
            notifiedTaskKeys.current.add(dedupeKey);
            await notify({
              type: 'TASK_REMINDER',
              title: 'Task starting soon',
              body: `“${task.name}” is scheduled to start at ${task.startTime}.`,
              sourceType: 'Task',
              sourceId: task.id,
              dedupeKey
            });
          }
        }
      } catch (err) {
        console.error('Task reminder scan failed:', err);
      }
    };

    scan();
    const interval = setInterval(scan, TASK_SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, notify]);

  return (
    <NotificationContext.Provider value={{ notifications, toasts, toast, notify, dismiss, dismissAll, dismissToast, refresh }}>
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
