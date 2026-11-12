import DOMPurify from 'isomorphic-dompurify';

/**
 * Wall sticky notes keep a small, safe subset of HTML: bold, italic, ink
 * colour and line breaks (Greek letters are just text). Notes written
 * before formatting existed are plain text and are shown exactly as typed.
 */

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'span', 'font', 'br', 'div', 'p'];
const ALLOWED_ATTR = ['style', 'color'];

/** Markup or an entity: written by the formatting editor, not typed as plain text. */
export function isRichNote(text: string): boolean {
  return /<\/?[a-z][^>]*>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text);
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/i;

/** Keeps only a plain colour in each style / color attribute. */
function keepColorOnly(html: string): string {
  return html
    .replace(/\sstyle="([^"]*)"/gi, (_m, css: string) => {
      const color = /(?:^|;)\s*color\s*:\s*([^;]+?)\s*(?:;|$)/i.exec(css.replace(/&quot;/g, '"'))?.[1];
      return color && SAFE_COLOR.test(color) ? ` style="color: ${color}"` : '';
    })
    .replace(/\scolor="([^"]*)"/gi, (_m, c: string) => (SAFE_COLOR.test(c) ? ` color="${c}"` : ''));
}

/** A note's text, cleaned for storing and for showing as HTML. Plain text is left as it is. */
export function sanitizeNoteText(text: string): string {
  if (!text || !isRichNote(text)) return text;
  return keepColorOnly(DOMPurify.sanitize(text, { ALLOWED_TAGS, ALLOWED_ATTR }));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML to show for a note: rich notes cleaned, plain ones escaped with their line breaks kept. */
export function noteToHtml(text: string): string {
  if (!text) return '';
  return isRichNote(text) ? sanitizeNoteText(text) : escapeHtml(text).replace(/\n/g, '<br>');
}

/** The words of a note, for searching the board. */
export function noteToPlainText(text: string): string {
  if (!text || !isRichNote(text)) return text || '';
  return DOMPurify.sanitize(text.replace(/<br\s*\/?>|<\/(div|p)>/gi, '\n'), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Greek letters offered in a note's Ω menu. */
export const GREEK_LETTERS = [
  'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω',
  'Γ', 'Δ', 'Θ', 'Λ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω',
];

/** Ink colours that read well on every note colour. */
export const NOTE_INKS = [
  { name: 'Ink', value: '#2a2a1f' },
  { name: 'Red', value: '#b42318' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Green', value: '#166534' },
  { name: 'Purple', value: '#6b21a8' },
];
