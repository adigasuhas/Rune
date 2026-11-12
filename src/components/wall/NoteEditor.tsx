'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GREEK_LETTERS, NOTE_INKS, noteToHtml } from '@/lib/noteRichText';

/**
 * A sticky note's text with light formatting: bold, italic, ink colour and
 * Greek letters. The small toolbar sits at the foot of the note and only
 * shows while the note is being written in, so a board at rest stays paper.
 * Ctrl/⌘+B and Ctrl/⌘+I work as usual.
 */
export function NoteEditor({ text, onChange, onCommit }: { text: string; onChange: (html: string) => void; onCommit: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<null | 'ink' | 'greek'>(null);
  const [empty, setEmpty] = useState(!text);
  const [active, setActive] = useState({ bold: false, italic: false });

  // Show the stored text, except while it's being written (that would move the caret).
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const html = noteToHtml(text);
    if (el.innerHTML !== html) el.innerHTML = html;
    setEmpty(!el.textContent?.trim());
  }, [text]);

  const current = () => {
    const el = ref.current;
    if (!el) return '';
    // An emptied note leaves a stray <br> or <div> behind; store it as empty.
    return el.textContent?.trim() ? el.innerHTML : '';
  };

  const emit = () => {
    setEmpty(!ref.current?.textContent?.trim());
    onChange(current());
  };

  const readState = () => {
    try {
      setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic') });
    } catch { /* not supported: leave the buttons plain */ }
  };

  const run = (command: string, value?: string) => {
    ref.current?.focus();
    // Colour as <span style="color">; bold and italic as <b> and <i>.
    document.execCommand('styleWithCSS', false, command === 'foreColor' ? 'true' : 'false');
    document.execCommand(command, false, value);
    emit();
    readState();
  };

  // Keep the selection in the note when a toolbar button is pressed.
  const keepFocus = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const tool = 'grid h-6 min-w-6 place-items-center rounded-[4px] px-1 text-[12.5px] leading-none transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black/40';

  return (
    <div
      ref={wrapRef}
      className="flex min-h-0 flex-1 flex-col"
      onBlur={(e) => {
        if (wrapRef.current?.contains(e.relatedTarget as Node | null)) return;
        setMenu(null);
        onCommit(current());
      }}
    >
      <div className="relative min-h-0 flex-1">
        {empty && (
          <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1 font-serif text-[16px] leading-snug text-black/40">
            Write something…
          </span>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="Note"
          contentEditable
          suppressContentEditableWarning
          onMouseDown={(e) => e.stopPropagation()}
          onInput={emit}
          onKeyUp={readState}
          onMouseUp={readState}
          onFocus={readState}
          className="h-full w-full overflow-y-auto break-words px-4 pb-2 pt-1 font-serif text-[16px] leading-snug focus:outline-none [&_b]:font-bold [&_strong]:font-bold"
          style={{ color: '#2a2a1f' }}
        />
      </div>

      {/* Formatting: shown while writing */}
      <div
        role="toolbar"
        aria-label="Format note"
        className="relative hidden shrink-0 items-center gap-0.5 px-2 pb-1.5 group-focus-within:flex"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" onMouseDown={keepFocus} onClick={() => run('bold')} aria-pressed={active.bold} className={`${tool} font-bold ${active.bold ? 'bg-black/15' : ''}`} title="Bold (Ctrl+B)" aria-label="Bold">B</button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run('italic')} aria-pressed={active.italic} className={`${tool} font-serif italic ${active.italic ? 'bg-black/15' : ''}`} title="Italic (Ctrl+I)" aria-label="Italic">I</button>
        <button type="button" onMouseDown={keepFocus} onClick={() => setMenu(menu === 'ink' ? null : 'ink')} aria-expanded={menu === 'ink'} className={tool} title="Text colour" aria-label="Text colour">
          <span className="font-semibold leading-none" style={{ textDecoration: 'underline', textDecorationColor: '#b42318', textDecorationThickness: 3, textUnderlineOffset: 2 }}>A</span>
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => setMenu(menu === 'greek' ? null : 'greek')} aria-expanded={menu === 'greek'} className={`${tool} font-serif`} title="Greek letters" aria-label="Greek letters">αβ</button>

        {menu === 'ink' && (
          <div className="absolute left-2 top-full z-30 mt-1 flex gap-1.5 rounded-[10px] border border-border bg-surface p-2 shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]" role="group" aria-label="Text colour">
            {NOTE_INKS.map((ink) => (
              <button
                key={ink.value}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => { run('foreColor', ink.value); setMenu(null); }}
                className="h-5 w-5 rounded-full border border-black/15 transition-transform hover:scale-110"
                style={{ backgroundColor: ink.value }}
                title={ink.name}
                aria-label={ink.name}
              />
            ))}
          </div>
        )}
        {menu === 'greek' && (
          <div className="absolute left-2 top-full z-30 mt-1 grid w-[13.5rem] grid-cols-8 gap-0.5 rounded-[10px] border border-border bg-surface p-1.5 text-foreground shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]" role="group" aria-label="Greek letters">
            {GREEK_LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => run('insertText', letter)}
                className="grid h-6 w-6 place-items-center rounded-[4px] font-serif text-[14px] hover:bg-surface-sunken"
                title={letter}
                aria-label={letter}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
