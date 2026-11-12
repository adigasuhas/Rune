import { describe, it, expect } from 'vitest';
import { isRichNote, noteToHtml, noteToPlainText, sanitizeNoteText } from '@/lib/noteRichText';

describe('wall note formatting', () => {
  it('keeps bold, italic, colour and Greek letters', () => {
    const html = '<b>Bold</b> <i>it</i> <span style="color: #b42318;">red</span> αβΩ<br>next';
    expect(sanitizeNoteText(html)).toBe('<b>Bold</b> <i>it</i> <span style="color: #b42318">red</span> αβΩ<br>next');
  });

  it('removes scripts, handlers, links and any style but a colour', () => {
    const out = sanitizeNoteText('<img src=x onerror="alert(1)"><a href="javascript:x">l</a><script>bad()</script><span style="background:url(http://x);color:#1d4ed8">ok</span><span style="color: expression(alert(1))">no</span>');
    expect(out).not.toMatch(/img|onerror|script|href|url\(|expression/i);
    expect(out).toContain('<span style="color: #1d4ed8">ok</span>');
    expect(out).toContain('<span>no</span>');
  });

  it('shows plain-text notes exactly as typed', () => {
    expect(isRichNote('a < b and c > d\nline two')).toBe(false);
    expect(noteToHtml('a < b\nline two')).toBe('a &lt; b<br>line two');
    expect(sanitizeNoteText('just words')).toBe('just words');
  });

  it('searches the words, not the markup', () => {
    expect(noteToPlainText('<b>Growth</b> of <span style="color: #b42318">Cs₃Sb</span> &amp; α')).toBe('Growth of Cs₃Sb & α');
  });
});
