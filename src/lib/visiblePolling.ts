/**
 * Polls `fn` every `intervalMs`, but only while the tab is visible.
 *
 * Every poll is a request (and several database queries) to the server, and a
 * background tab polling every few seconds all day costs as much as someone
 * actively using the app. While the tab is hidden, ticks are skipped; when it
 * becomes visible again `fn` runs at once, so what the user sees is never
 * staler than it would have been with plain `setInterval`.
 *
 * Returns a function that stops polling.
 */
export function startVisiblePolling(fn: () => void, intervalMs: number): () => void {
  const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  const timer = setInterval(() => { if (isVisible()) fn(); }, intervalMs);
  const onVisibilityChange = () => { if (isVisible()) fn(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
