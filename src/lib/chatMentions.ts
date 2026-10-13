/**
 * Pure logic behind TeamChat's @mention autocomplete and highlighting -
 * split out of TeamChat.tsx so it's unit-testable without a DOM/React test
 * harness this codebase doesn't otherwise need.
 */

/** Returns the partial name typed after a trailing, still-open `@`, or null if the caret isn't in one. */
export function detectMentionTrigger(textBeforeCursor: string): string | null {
  const match = /@([a-zA-Z0-9._-]*)$/.exec(textBeforeCursor);
  return match ? match[1] : null;
}

export function filterMentionCandidates<T extends { label: string }>(candidates: T[], query: string, limit = 6): T[] {
  const q = query.toLowerCase();
  return candidates.filter((c) => c.label.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Builds the case-sensitive "@Full Name" highlight pattern from known
 * display names - longest name first, so e.g. "Jo" can't shadow-match
 * inside an already-matched "Joanna Smith".
 */
export function buildMentionHighlightPattern(names: string[]): RegExp | null {
  const unique = Array.from(new Set(names.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  const escaped = unique.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`@(${escaped.join('|')})`, 'g');
}
