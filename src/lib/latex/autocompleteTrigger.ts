/**
 * Pure logic behind the notebook editor's \cite{ / \ref{ / \eqref{ / \begin{
 * / \run{ autocomplete - split out of NotebookView.tsx so the trigger
 * detection and filtering (the part most likely to silently regress, as the
 * \run{ filter bug this session found the hard way) can be unit-tested
 * without a DOM/React test harness this codebase doesn't otherwise need.
 */

export interface AutocompleteTriggerMatch {
  kind: 'cite' | 'ref' | 'begin' | 'run';
  /** Offset into the full text where the typed-so-far argument begins (after the last `{` or `,`). */
  queryStart: number;
  query: string;
}

/** Inspects the text up to the caret for an open, unclosed \cite{ / \ref{ / \eqref{ / \begin{ / \run{. */
export function detectAutocompleteTrigger(textBeforeCursor: string, cursor: number): AutocompleteTriggerMatch | null {
  const match = /\\(cite|ref|eqref|begin|run)\{([^{}\n]*)$/.exec(textBeforeCursor);
  if (!match) return null;

  const kind: AutocompleteTriggerMatch['kind'] =
    match[1] === 'cite' ? 'cite' : match[1] === 'begin' ? 'begin' : match[1] === 'run' ? 'run' : 'ref';
  const rawArg = match[2];
  const lastComma = rawArg.lastIndexOf(',');
  const query = lastComma === -1 ? rawArg : rawArg.slice(lastComma + 1);
  const queryStart = cursor - query.length;

  return { kind, queryStart, query };
}

/**
 * Matches the typed query against both `key` and `label` - not just `key`.
 * `key` is what a citation/label reference actually looks like typed
 * (a bibtex key, a `sec:intro`-style label), but for a \run{ reference the
 * key is an opaque job id nobody types; only the label (the run's name)
 * is ever typed, so key-only matching would empty the pool - and did,
 * before this was caught.
 */
export function filterAutocompleteItems<T extends { key: string; label: string }>(
  pool: T[],
  query: string,
  limit = 8
): T[] {
  const q = query.trim().toLowerCase();
  const items = q ? pool.filter((it) => it.key.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)) : pool;
  return items.slice(0, limit);
}
