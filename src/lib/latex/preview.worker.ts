/// <reference lib="webworker" />
/**
 * Renders the notebook preview (LaTeX -> HTML, KaTeX included) off the main
 * thread, so the editor stays responsive however long a render takes - and
 * if a render ever never finishes, the page can drop this worker and carry
 * on (see useLatexPreview). Sanitising happens back on the main thread,
 * where DOMPurify has a DOM.
 *
 * Imports only the pure LaTeX modules: nothing here may touch the DOM.
 */
import { parseLatexToHtml } from './renderer';

export interface PreviewRequest {
  id: number;
  content: string;
  pages: unknown[];
  pageId: string;
  runsMap: Record<string, { name: string; status: string }>;
}
export type PreviewResponse = { id: number; html: string } | { id: number; error: string };

const stripPageMetadata = (content: string) => content.replace(/<!--RUNE_METADATA_START([\s\S]*?)RUNE_METADATA_END-->/g, '');

self.onmessage = (event: MessageEvent<PreviewRequest>) => {
  const { id, content, pages, pageId, runsMap } = event.data;
  try {
    const html = content ? parseLatexToHtml(stripPageMetadata(content), pages, pageId, false, runsMap) : '';
    (self as unknown as Worker).postMessage({ id, html } satisfies PreviewResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies PreviewResponse);
  }
};
