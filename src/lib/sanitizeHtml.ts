/**
 * Output sanitisation for notebook content.
 *
 * The notebook's LaTeX-style markup is compiled to an HTML string
 * (`src/lib/latex/renderer.ts`) that is then handed to
 * `dangerouslySetInnerHTML` in the live preview and to Puppeteer's
 * `page.setContent` in PDF export. Both of those execute whatever HTML they
 * are given. Notebook content is user-authored and, in Team/Lab mode, shared
 * between users - so it must be treated as untrusted and scrubbed before it
 * reaches either sink.
 *
 * This is the single, guaranteed backstop: even if a renderer branch forgets
 * to escape an interpolation, nothing dangerous survives this pass.
 * `isomorphic-dompurify` runs the same allow-list on the server (jsdom) and
 * in the browser.
 */
import DOMPurify from 'isomorphic-dompurify';

// Attributes the renderer and KaTeX legitimately emit that are not in
// DOMPurify's default allow-list.
const EXTRA_ATTR = [
  'data-page-id',
  'data-scroll-to',
  'target',
  // KaTeX / MathML presentation hooks
  'aria-hidden',
  'style',
];

// Hard block regardless of profile.
const FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'base', 'meta'];
const FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'formaction', 'srcdoc'];

let configured = false;
function configureHooks() {
  if (configured) return;
  configured = true;

  // Force every link to open safely and never navigate to a non-web scheme.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      const safe = /^(https?:|mailto:|#)/i.test(href.trim());
      if (!safe) node.removeAttribute('href');
      if (node.hasAttribute('target')) {
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    // Images may only load from our own upload proxy or inline data - never
    // an arbitrary remote URL (blind SSRF surface during PDF export).
    if (node.tagName === 'IMG') {
      const src = (node.getAttribute('src') || '').trim();
      const ok = src.startsWith('/api/uploads/') || src.startsWith('data:image/');
      if (!ok) node.removeAttribute('src');
      node.setAttribute('loading', 'lazy');
    }
    // The `style` attribute is allow-listed (KaTeX/MathML need it), but
    // DOMPurify doesn't parse CSS - a url(...) inside it (background-image,
    // border-image, @import) is an SSRF vector the IMG check above doesn't
    // cover: PDF export hands this HTML to Puppeteer, which will happily
    // issue a real outbound request for any url() it renders, including one
    // pointing at an internal service or a cloud metadata endpoint. Team
    // mode's threat model already assumes a teammate can be malicious, so
    // this is reachable from any notebook a teammate can edit. Nothing the
    // renderer emits legitimately needs a CSS url() - strip it outright.
    if (node.hasAttribute('style')) {
      const style = node.getAttribute('style') || '';
      const cleaned = style.replace(/url\s*\([^)]*\)/gi, '').replace(/@import[^;]*;?/gi, '');
      if (cleaned !== style) {
        if (cleaned.trim()) node.setAttribute('style', cleaned);
        else node.removeAttribute('style');
      }
    }
  });
}

export function sanitizeNotebookHtml(html: string): string {
  if (!html) return '';
  configureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_ATTR: EXTRA_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: true,
    // Keep the document fragment only - no <html>/<body> wrapper.
    WHOLE_DOCUMENT: false,
  });
}

/**
 * Narrow sanitiser for a short plain-text-ish string that will land inside an
 * HTML attribute or text node (page titles, author name, project name in the
 * PDF cover/header). Strips all markup.
 */
export function sanitizePlainText(value: string): string {
  if (!value) return '';
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
