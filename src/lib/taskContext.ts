/**
 * A task's contexts - where or how the work happens (Computer, Reading,
 * Meeting, or the writer's own: "Bench work", "Beamline"). A task can have
 * several. They're stored in Task.context as one comma-separated string of
 * upper-case tokens ("COMPUTER,WRITING"), so a task saved before this was
 * possible is simply a list of one, and nothing needs migrating.
 */

export const STANDARD_CONTEXTS = [
  { value: 'COMPUTER', label: 'Computer' },
  { value: 'CODING', label: 'Coding' },
  { value: 'READING', label: 'Reading' },
  { value: 'WRITING', label: 'Writing' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'ANALYSIS', label: 'Analysis' },
] as const;

/** A new task starts with this one picked. */
export const DEFAULT_CONTEXTS = ['COMPUTER'];

/** At most this many per task, each at most this long - the column is small text. */
export const MAX_CONTEXTS = 8;
export const MAX_CONTEXT_LENGTH = 32;

/** One context as stored: no separators, single-spaced, upper case, capped; '' when nothing's left. */
export function normalizeContext(raw: string): string {
  return String(raw ?? '')
    .replace(/[,;|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTEXT_LENGTH)
    .trim()
    .toUpperCase();
}

/** The stored string (or a list) as a clean list: no blanks, no repeats, in order. */
export function parseContexts(value: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
  const out: string[] = [];
  for (const p of parts) {
    const c = normalizeContext(p);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= MAX_CONTEXTS) break;
  }
  return out;
}

/** A list as stored in Task.context. */
export function joinContexts(contexts: string[]): string {
  return parseContexts(contexts).join(',');
}

export function isStandardContext(c: string): boolean {
  return STANDARD_CONTEXTS.some((s) => s.value === c);
}

/** "BENCH WORK" -> "Bench work"; the standard ones by their own label. */
export function contextLabel(c: string): string {
  const std = STANDARD_CONTEXTS.find((s) => s.value === c);
  if (std) return std.label;
  const lower = c.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "Computer, Writing" for a stored value. */
export function contextsText(value: string | null | undefined): string {
  return parseContexts(value).map(contextLabel).join(', ');
}

/** Whether a task's contexts include `filter` (any case). */
export function hasContext(value: string | null | undefined, filter: string): boolean {
  return parseContexts(value).includes(normalizeContext(filter));
}

/** The writer's own (non-standard) contexts across `tasks`, most used first. */
export function ownContextsByUse(tasks: Array<{ context?: string | null }>, limit = 12): string[] {
  const uses = new Map<string, number>();
  for (const t of tasks || []) {
    for (const c of parseContexts(t.context)) if (!isStandardContext(c)) uses.set(c, (uses.get(c) ?? 0) + 1);
  }
  return [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([c]) => c);
}
