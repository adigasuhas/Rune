'use client';

import React from 'react';
import { Spot, type SpotKind } from '@/components/brand/Spot';

/**
 * Rune's shared app components. They carry the public site's voice into the
 * signed-in app: serif page titles, sentence-case section labels over a fine
 * ink rule, quiet surfaces, one accent (pine), and the comic character in
 * empty states. Screens compose these instead of re-declaring Tailwind
 * strings, so the app reads as one product.
 */

// ---------------------------------------------------------------------------
// Button - same family as the site's .btn (radius 9px, never a pill)
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md';

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-[9px] transition-[background-color,border-color,color,transform] duration-[var(--duration-micro)] active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover border border-primary',
  ghost: 'bg-surface text-foreground border border-border-strong hover:bg-surface-raised',
  danger: 'bg-danger text-primary-foreground hover:bg-danger-hover border border-danger',
  subtle: 'bg-transparent text-ink-secondary hover:text-foreground hover:bg-surface-sunken border border-transparent',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'text-[13px] h-8 px-3',
  md: 'text-[14px] h-9 px-3.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`} {...props} />;
}

// ---------------------------------------------------------------------------
// Panel + PanelHeader - for things that genuinely sit on a surface (a
// planner, a board). Lists and summaries use SectionHeader instead.
// ---------------------------------------------------------------------------
export function Panel({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-surface border border-border rounded-[12px] ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  children,
  right,
  className = '',
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-border ${className}`}>
      <span className="text-[14px] font-semibold text-foreground">{children}</span>
      {right}
    </div>
  );
}

/** A section label over a fine ink rule - the app's main grouping device. */
export function SectionHeader({
  title,
  meta,
  right,
  as: Tag = 'h2',
  className = '',
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={`app-section ${className}`}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <Tag>{title}</Tag>
        {meta != null && <span className="meta tabular-nums">{meta}</span>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag (project / context labels)
// ---------------------------------------------------------------------------
export function Tag({
  children,
  tone = 'pine',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'pine' | 'neutral';
  className?: string;
}) {
  const c = tone === 'pine' ? 'bg-primary-soft text-primary' : 'bg-surface-sunken text-ink-secondary';
  return (
    <span className={`inline-block text-[12px] font-medium px-1.5 py-px rounded-[5px] whitespace-nowrap ${c} ${className}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusPill
// ---------------------------------------------------------------------------
export type Status = 'running' | 'queued' | 'done' | 'failed' | 'overdue' | 'active' | 'neutral';
const PILL: Record<Status, string> = {
  running: 'badge-accent',
  active: 'badge-accent',
  queued: 'badge-neutral',
  neutral: 'badge-neutral',
  done: 'badge-info',
  failed: 'badge-danger',
  overdue: 'badge-danger',
};
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export function StatusPill({ status, children }: { status: Status; children?: React.ReactNode }) {
  const content = typeof children === 'string' ? sentence(children) : children ?? sentence(status);
  return (
    <span className={`badge ${PILL[status]}`}>
      {status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden="true" />}
      {content}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState - the Rune character with one prop, a line, and one action
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  spot,
  title,
  message,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  spot?: SpotKind;
  title: string;
  message?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`mx-auto flex max-w-[40ch] flex-col items-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      {spot ? (
        <Spot kind={spot} size={compact ? 108 : 144} className="mb-4" />
      ) : icon ? (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-[12px] bg-surface-sunken text-ink-faint">{icon}</div>
      ) : null}
      <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
      {message && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-secondary">{message}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader - serif title, one plain line under it, actions to the right
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  className = 'mb-8',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="app-title">{title}</h1>
          {meta}
        </div>
        {subtitle && <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// StatRow - a few numbers in a ruled line, no boxes
// ---------------------------------------------------------------------------
export function StatRow({ items }: { items: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode }[] }) {
  return (
    <dl
      className="grid gap-x-8 gap-y-5 border-t border-foreground/75 pt-4"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="flex items-center gap-1.5 text-[13px] text-ink-secondary">{it.icon}{it.label}</dt>
          <dd className="mt-1 font-serif text-[30px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums">{it.value}</dd>
          {it.sub && <dd className="mt-1.5 text-[12.5px] text-ink-faint">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
