import { describe, it, expect } from 'vitest';
import { resolveLatexColor, tintHex } from '@/lib/latex/colors';
import { parseLatexToHtml } from '@/lib/latex/renderer';
import { sanitizeNotebookHtml } from '@/lib/sanitizeHtml';

const render = (src: string) => sanitizeNotebookHtml(parseLatexToHtml(src));

describe('\\textcolor and \\colorbox colours', () => {
  it('reads the forms xcolor accepts', () => {
    expect(resolveLatexColor('HTML', 'EF4444')?.css).toBe('#ef4444');
    expect(resolveLatexColor(null, '#3b82f6')?.css).toBe('#3b82f6');
    expect(resolveLatexColor(null, '#abc')?.css).toBe('#aabbcc');
    expect(resolveLatexColor('rgb', '1,0,0')?.css).toBe('#ff0000');
    expect(resolveLatexColor('RGB', '0,128,255')?.css).toBe('#0080ff');
    expect(resolveLatexColor('gray', '0.5')?.css).toBe('#808080');
    expect(resolveLatexColor(null, 'red')?.css).toBe('#ef4444');
    expect(resolveLatexColor(null, 'rgba(239, 68, 68, 0.25)')?.css).toBe('rgba(239, 68, 68, 0.25)');
  });

  it('mixes like xcolor: red!40 is 40% red over white, red!50!blue half and half', () => {
    expect(resolveLatexColor(null, 'black!50')?.css).toBe('#808080');
    expect(resolveLatexColor(null, 'red!50!blue')?.css).toBe('#95639d');
  });

  it('an unreadable colour leaves the text visible (never white)', () => {
    expect(resolveLatexColor(null, 'nonsense')).toBeNull();
    expect(resolveLatexColor('HTML', 'zz')).toBeNull();
    expect(render('\\textcolor{nonsense}{still here}')).toContain('still here');
    expect(render('\\textcolor{nonsense}{still here}')).not.toContain('color:');
  });

  it('the toolbar\'s colours show in the preview and export', () => {
    expect(render('\\textcolor[HTML]{EF4444}{red words} after')).toMatch(/<span class="ltx-color" style="color: #ef4444;">red words<\/span> after/);
    // Older notebooks stored the hex inside the braces - still coloured.
    expect(render('\\textcolor{#ef4444}{old}')).toContain('color: #ef4444;');
    expect(render('\\textbf{\\textcolor[rgb]{0,0.5,0}{nested}}')).toContain('<strong><span class="ltx-color" style="color: #008000;">nested</span></strong>');
  });

  it('a highlight keeps its words readable', () => {
    expect(render(`\\colorbox[HTML]{${tintHex('#f59e0b', 25)}}{hi}`)).toMatch(/background-color: #fde7c2; color: #1f2937;/);
    // See-through (older) highlights take the page's own ink.
    expect(render('\\colorbox{rgba(239, 68, 68, 0.25)}{old}')).not.toContain('color: #1f2937');
  });

  it('a hostile colour never reaches the style attribute', () => {
    const out = render('\\textcolor[HTML]{x"><img src=x onerror=alert(1)>}{hi}');
    expect(out).not.toContain('onerror');
    expect(out).toContain('hi');
  });
});

describe('paragraphs after a heading', () => {
  it('text written straight under a heading is a paragraph, not loose text', () => {
    const html = parseLatexToHtml('\\section{Intro}\nFirst words.\n\nSecond.');
    expect(html).toMatch(/<\/h2>\n<p[^>]*>First words\.<\/p>/);
  });
});
