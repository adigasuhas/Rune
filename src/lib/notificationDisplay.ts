import { Cpu, CheckSquare, Ban, CalendarDays, BookOpen, MessageSquare } from 'lucide-react';
import type { NotificationItem } from '@/context/NotificationContext';

/** Shared between the notification bell and the full /notifications inbox page, so the two never drift on what a notification looks like or where it goes. */

/** Where clicking a notification should take you. Null = not navigable. */
export function deepLinkFor(item: NotificationItem): string | null {
  if (item.sourceType === 'Notebook' && item.sourceId) return `/review/${item.sourceId}`;
  if (item.sourceType === 'Task' && item.sourceId) return '/tasks';
  if (item.sourceType === 'Job' && item.sourceId) return '/jobs';
  if (item.sourceType === 'Team' && item.sourceId) return `/teams/${item.sourceId}`;
  if (item.sourceType === 'Digest') return '/';
  return null;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function iconFor(item: NotificationItem) {
  if (item.type === 'TASK_BLOCKED') return Ban;
  if (item.type === 'WEEKLY_DIGEST') return CalendarDays;
  if (item.type === 'NOTEBOOK_REVIEW_REQUESTED' || item.type === 'NOTEBOOK_COMMENT') return BookOpen;
  if (item.type === 'CHAT_MENTION') return MessageSquare;
  if (item.sourceType === 'Job') return Cpu;
  return CheckSquare;
}
