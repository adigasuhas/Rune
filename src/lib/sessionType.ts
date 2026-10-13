/**
 * Single source of truth for the Deep Work / Focus / Regular Work distinction.
 * Deep Work = highest concentration, Focus = medium concentration,
 * Regular Work = baseline. One duration field is shared across all three
 * (Task.estimatedTime / CalendarEvent length); only its label changes
 * depending on sessionType.
 */
export type SessionType = 'DEEP_WORK' | 'FOCUS' | 'REGULAR';

export interface SessionTypeMeta {
  value: SessionType;
  label: string;
  durationLabel: string;
  description: string;
  colorClass: string;
  activeClass: string;
}

export const SESSION_TYPE_META: Record<SessionType, SessionTypeMeta> = {
  DEEP_WORK: {
    value: 'DEEP_WORK',
    label: 'Deep work',
    durationLabel: 'Deep work duration',
    description: 'Highest concentration. Uninterrupted, mentally demanding work.',
    colorClass: 'text-primary',
    activeClass: 'bg-primary-soft border-primary text-primary'
  },
  FOCUS: {
    value: 'FOCUS',
    label: 'Focus',
    durationLabel: 'Focus duration',
    description: 'Medium concentration. Steady, engaged work.',
    colorClass: 'text-[var(--color-data-slate)]',
    activeClass: 'bg-surface-sunken border-border-strong text-[var(--color-data-slate)]'
  },
  REGULAR: {
    value: 'REGULAR',
    label: 'Regular work',
    durationLabel: 'Work duration',
    description: 'Baseline concentration. Routine and administrative work.',
    colorClass: 'text-ink-faint',
    activeClass: 'bg-surface-sunken border-border-strong text-ink-secondary'
  }
};

export const SESSION_TYPES: SessionType[] = ['DEEP_WORK', 'FOCUS', 'REGULAR'];

export function isSessionType(value: unknown): value is SessionType {
  return value === 'DEEP_WORK' || value === 'FOCUS' || value === 'REGULAR';
}

export function normalizeSessionType(value?: string | null): SessionType {
  return isSessionType(value) ? value : 'REGULAR';
}

export function durationLabel(sessionType?: string | null): string {
  return SESSION_TYPE_META[normalizeSessionType(sessionType)].durationLabel;
}

export function sessionTypeLabel(sessionType?: string | null): string {
  return SESSION_TYPE_META[normalizeSessionType(sessionType)].label;
}

/**
 * Resolves the session type for a calendar event: an explicit value wins,
 * otherwise inherit from a linked task, otherwise fall back to REGULAR.
 */
export function resolveSessionType(explicit?: string | null, linkedSessionType?: string | null): SessionType {
  if (explicit !== undefined && explicit !== null) return normalizeSessionType(explicit);
  if (linkedSessionType !== undefined && linkedSessionType !== null) return normalizeSessionType(linkedSessionType);
  return 'REGULAR';
}
