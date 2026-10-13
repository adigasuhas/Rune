'use client';

import React from 'react';
import { Flame, Brain, Briefcase } from 'lucide-react';
import { SESSION_TYPES, SESSION_TYPE_META, SessionType, normalizeSessionType } from '@/lib/sessionType';

const ICONS: Record<SessionType, React.ComponentType<{ className?: string }>> = {
  DEEP_WORK: Flame,
  FOCUS: Brain,
  REGULAR: Briefcase
};

interface SessionTypeSelectorProps {
  value?: string | null;
  onChange: (value: SessionType) => void;
  size?: 'sm' | 'md';
  /** Hide text labels and show icon-only buttons (label still available via tooltip) - for tight spaces like task cards. */
  iconOnly?: boolean;
  className?: string;
}

export function SessionTypeSelector({ value, onChange, size = 'md', iconOnly = false, className = '' }: SessionTypeSelectorProps) {
  const current = normalizeSessionType(value);
  const isSmall = size === 'sm';

  return (
    <div className={`inline-flex items-center gap-1 bg-surface-raised border border-border rounded-xl p-1 shrink-0 ${className}`}>
      {SESSION_TYPES.map((type) => {
        const meta = SESSION_TYPE_META[type];
        const Icon = ICONS[type];
        const isActive = current === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            title={iconOnly ? `${meta.label}: ${meta.description}` : meta.description}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              iconOnly ? '' : 'flex-1'
            } ${
              isSmall ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
            } ${
              isActive
                ? meta.activeClass
                : 'border-transparent text-muted-foreground hover:text-ink-secondary'
            }`}
          >
            <Icon className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            {!iconOnly && meta.label}
          </button>
        );
      })}
    </div>
  );
}
