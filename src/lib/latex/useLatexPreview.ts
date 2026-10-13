'use client';

import { useEffect, useRef, useState } from 'react';
import { parseMarkdownToHtml } from '@/lib/notebookExport';
import { sanitizeNotebookHtml } from '@/lib/sanitizeHtml';
import type { PreviewRequest, PreviewResponse } from './preview.worker';

/** A render taking longer than this is treated as stuck: the worker is replaced. */
const STUCK_MS = 3000;

export interface LatexPreview {
  html: string;
  /** Why the latest text couldn't be rendered, if it couldn't; the last good preview stays up. */
  problem: string | null;
}

/**
 * The notebook's rendered preview, computed in a Web Worker
 * (preview.worker.ts) so typing never waits for LaTeX/KaTeX.
 *
 * Containment, in order: a render that throws reports its error; a render
 * that hangs is cut off after STUCK_MS (the worker is terminated and a
 * fresh one takes the next render); either way the last good preview stays
 * on screen and the editor is untouched. Browsers without workers render
 * on the main thread, still inside a try/catch.
 */
export function useLatexPreview(
  content: string,
  pages: unknown[],
  pageId: string | null,
  runsMap: Record<string, { name: string; status: string }>
): LatexPreview {
  const [state, setState] = useState<LatexPreview>({ html: '', problem: null });
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);
  const watchdog = useRef<number | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (watchdog.current) window.clearTimeout(watchdog.current);
  }, []);

  useEffect(() => {
    if (!pageId) return;
    const id = ++seq.current;

    const makeWorker = (): Worker | null => {
      if (typeof Worker === 'undefined') return null;
      try {
        const w = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<PreviewResponse>) => {
          if (e.data.id !== seq.current) return; // a newer render has been asked for
          if (watchdog.current) window.clearTimeout(watchdog.current);
          if ('error' in e.data) {
            const error = e.data.error;
            setState((s) => ({ html: s.html, problem: `Couldn’t render this part of the document (${error}).` }));
          } else {
            setState({ html: sanitizeNotebookHtml(e.data.html), problem: null });
          }
        };
        return w;
      } catch {
        return null;
      }
    };

    if (!workerRef.current) workerRef.current = makeWorker();
    const worker = workerRef.current;

    if (!worker) {
      // No workers: render here, but never let a failure take the editor with it.
      queueMicrotask(() => {
        if (id !== seq.current) return;
        try {
          setState({ html: parseMarkdownToHtml(content, pages as never[], pageId, false, runsMap), problem: null });
        } catch (err) {
          setState((s) => ({ html: s.html, problem: `Couldn’t render this part of the document (${(err as Error).message}).` }));
        }
      });
      return;
    }

    if (watchdog.current) window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => {
      if (id !== seq.current) return;
      worker.terminate();
      workerRef.current = null; // the next render gets a fresh worker
      setState((s) => ({ html: s.html, problem: 'This part of the document is taking too long to render. Keep typing; the preview will catch up.' }));
    }, STUCK_MS);
    worker.postMessage({ id, content, pages, pageId, runsMap } satisfies PreviewRequest);
  }, [content, pages, pageId, runsMap]);

  return state;
}
