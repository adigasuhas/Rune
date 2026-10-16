'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Bell, X } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

/**
 * Toasts sit bottom-right, out of the way of page headers and their
 * actions. Readable in both themes: a solid surface, ink text, and the
 * colour only on the icon. At most three are on screen; older ones are
 * still in the bell.
 */
const ICON = {
  success: <CheckCircle2 className="w-[18px] h-[18px] text-primary shrink-0 mt-px" />,
  error: <AlertCircle className="w-[18px] h-[18px] text-danger shrink-0 mt-px" />,
  warning: <AlertTriangle className="w-[18px] h-[18px] text-warning shrink-0 mt-px" />,
  info: <Bell className="w-[18px] h-[18px] text-ink-secondary shrink-0 mt-px" />,
} as const;

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();
  const visible = toasts.slice(-3);

  return (
    <div aria-live="polite" aria-atomic="false" className="fixed bottom-5 right-5 z-[100] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2.5 pointer-events-none">
      {visible.map((t) => (
        <div
          key={t.id}
          role={t.actions?.length ? 'alertdialog' : 'status'}
          aria-label={t.actions?.length ? t.title : undefined}
          className="pointer-events-auto flex items-start gap-3 rounded-[12px] border border-border bg-surface p-3.5 text-foreground shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)] animate-slide-in"
        >
          {ICON[t.type as keyof typeof ICON] ?? ICON.info}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold leading-snug">{t.title}</p>
            {t.message && <p className="mt-0.5 text-[13px] leading-snug text-ink-secondary">{t.message}</p>}
            {t.actions && t.actions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    className={a.primary
                      ? 'rounded-full bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary-hover transition-colors'
                      : 'rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:border-border-strong hover:text-foreground transition-colors'}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => dismissToast(t.id)} className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-[7px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Dismiss notification">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
