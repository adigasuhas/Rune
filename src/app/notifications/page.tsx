'use client';

import { LoadError } from '@/components/LoadError';
import { PageHeader } from '@/components/ui';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, CheckCheck, ChevronDown } from 'lucide-react';
import { useNotifications, NotificationItem } from '@/context/NotificationContext';
import { deepLinkFor, timeAgo, iconFor } from '@/lib/notificationDisplay';

const TYPE_LABELS: Record<string, string> = {
  JOB_REMINDER: 'Run reminder',
  JOB_RECURRING: 'Run reminder',
  JOB_TERMINATION: 'Run finished',
  TASK_REMINDER: 'Task reminder',
  RUN_APPROACHING_END: 'Run almost finished',
  RUN_OVERDUE: 'Run overdue',
  TASK_BLOCKED: 'Task blocked',
  WEEKLY_DIGEST: 'Weekly digest',
  NOTEBOOK_REVIEW_REQUESTED: 'Notebook review',
  NOTEBOOK_COMMENT: 'Notebook comment',
  TASK_ASSIGNED: 'Task assigned',
  TASK_ACCEPTED: 'Task accepted',
  TASK_DECLINED: 'Task declined',
  CHAT_MENTION: 'Mention'
};

const PAGE_SIZE = 50;

/**
 * The full history the bell's dropdown deliberately doesn't show (it's
 * active-only, by design, so it never grows unbounded) - every notification
 * ever sent to this account, newest first, filterable by type, paginated.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { dismiss, dismissAll } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const fetchPage = async (skip: number) => {
    const res = await fetch(`/api/notifications?all=true&skip=${skip}`).catch(() => null);
    if (!res?.ok) return [];
    const page: NotificationItem[] = await res.json();
    return page;
  };

  const [loadFailed, setLoadFailed] = useState(false);
  const loadFirst = async () => {
    try {
      const res = await fetch(`/api/notifications?all=true&skip=0`);
      if (!res.ok) throw new Error(String(res.status));
      const page: NotificationItem[] = await res.json();
      setItems(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => { await loadFirst(); })();
     
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const page = await fetchPage(items.length);
    setItems((prev) => [...prev, ...page]);
    setHasMore(page.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleOpen = (item: NotificationItem) => {
    const url = deepLinkFor(item);
    if (!url) return;
    if (item.sourceType === 'Task' && item.sourceId) {
      try { sessionStorage.setItem('rune-deep-link-task-id', item.sourceId); } catch { /* private mode */ }
    }
    router.push(url);
  };

  const availableTypes = Array.from(new Set(items.map((i) => i.type)));
  const visible = typeFilter === 'ALL' ? items : items.filter((i) => i.type === typeFilter);
  const activeCount = items.filter((i) => !i.dismissedAt).length;

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        className="mb-6"
        title="Notifications"
        subtitle="All your notifications, newest first."
        actions={activeCount > 0 && (
          <button
            type="button"
            onClick={async () => { await dismissAll(); setItems((prev) => prev.map((i) => (i.dismissedAt ? i : { ...i, read: true, dismissedAt: new Date().toISOString() }))); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      />

      {availableTypes.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="page-type" className="text-[12.5px] font-semibold text-ink-faint">Type</label>
          <select id="page-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface-raised border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground cursor-pointer"
          >
            <option value="ALL">All types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-surface border border-border rounded-md overflow-hidden">
        {loading ? (
          <p className="text-xs text-muted-foreground p-6 text-center">Loading…</p>
        ) : loadFailed ? (
          <LoadError what="your notifications" onRetry={() => { setLoading(true); setLoadFailed(false); loadFirst(); }} className="m-4" />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <Inbox className="w-8 h-8 text-ink-faint mb-2" />
            <p className="text-xs text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          visible.map((item) => {
            const Icon = iconFor(item);
            const navigable = !!deepLinkFor(item);
            const isRead = !!item.dismissedAt;
            return (
              <div
                key={item.id}
                onClick={navigable ? () => handleOpen(item) : undefined}
                className={`flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-b-0 transition-colors ${navigable ? 'cursor-pointer hover:bg-surface-sunken/30' : ''}`}
              >
                <div className="p-1.5 rounded-lg bg-surface-raised border border-border-strong shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {/* Read items keep full contrast; only the title weight and the dot change. */}
                    <p className={`text-[13px] ${isRead ? 'font-normal text-ink-secondary' : 'font-semibold text-foreground'}`}>{item.title}</p>
                    {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"><span className="sr-only">Unread</span></span>}
                  </div>
                  {item.body && <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-normal">{item.body}</p>}
                  <p className="text-[11.5px] text-ink-faint mt-1">{TYPE_LABELS[item.type] || item.type} · {timeAgo(item.createdAt)}</p>
                </div>
                {!isRead && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); dismiss(item.id); setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true, dismissedAt: new Date().toISOString() } : i))); }}
                    className="text-[12px] font-semibold text-primary hover:text-primary-hover shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {!loading && !loadFailed && hasMore && typeFilter === 'ALL' && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-ink-secondary hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" /> {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
