'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { useNotifications, NotificationItem } from '@/context/NotificationContext';
import { deepLinkFor, timeAgo, iconFor } from '@/lib/notificationDisplay';

export function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { notifications, dismiss, dismissAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const openItem = (item: NotificationItem) => {
    const url = deepLinkFor(item);
    if (!url) return;
    if (item.sourceType === 'Task' && item.sourceId) {
      try { sessionStorage.setItem('rune-deep-link-task-id', item.sourceId); } catch { /* private mode */ }
    }
    setOpen(false);
    router.push(url);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md bg-surface-raised border border-border hover:border-border-strong text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Notifications"
        aria-label={notifications.length ? `Notifications, ${notifications.length} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="w-4.5 h-4.5" />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--clay)] text-white text-[10.5px] font-semibold flex items-center justify-center">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-2 w-80 max-w-[90vw] bg-card border border-border rounded-md shadow-[var(--shadow-modal)] z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-2">
            <h3 className="text-[12.5px] font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono">{notifications.length} new</span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={dismissAll}
                  className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary-hover cursor-pointer"
                  title="Mark all read"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Inbox className="w-8 h-8 text-ink-faint mb-2" />
                <p className="text-xs text-muted-foreground">No new notifications</p>
              </div>
            ) : (
              notifications.map((item) => {
                const Icon = iconFor(item);
                const navigable = !!deepLinkFor(item);
                return (
                  <div
                    key={item.id}
                    onClick={navigable ? () => openItem(item) : undefined}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-surface-sunken/30 transition-colors ${navigable ? 'cursor-pointer' : ''}`}
                  >
                    <div className="p-1.5 rounded-lg bg-surface-raised border border-border-strong shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{item.title}</p>
                      {item.body && <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{item.body}</p>}
                      <p className="text-[9px] text-ink-faint font-mono mt-1">{timeAgo(item.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); dismiss(item.id); }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors cursor-pointer shrink-0"
                      title="Mark as read" aria-label="Mark as read">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/notifications'); }}
            className="w-full text-center py-2 text-[11px] font-semibold text-primary hover:text-primary-hover border-t border-border cursor-pointer"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
