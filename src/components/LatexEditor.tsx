'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type * as MonacoNS from 'monaco-editor';

/**
 * Real LaTeX syntax highlighting for the notebook's Write pane, on Monaco
 * (the editor behind VS Code). Replaced the earlier CodeMirror 6 build on
 * request - same external contract (`LatexEditorHandle`/props) so
 * `NotebookView.tsx`'s toolbar, autocomplete-trigger detection, and
 * keyboard handling didn't need to change at all, only what's underneath.
 *
 * LaTeX has no built-in Monaco language, same gap CodeMirror had - a
 * custom Monarch tokenizer (`LATEX_LANGUAGE` below) fills it: commands ->
 * pine, braces -> ink-faint, a recognized reference command's argument
 * (`\cite{}`/`\ref{}`/`\eqref{}`/`\label{}`/`\run{}`) -> slate, comments ->
 * ink-3 italic. Monaco's theming API takes literal hex colors, not live
 * CSS custom properties, so `LEDGER_LIGHT`/`LEDGER_DARK` are registered as
 * two static themes (values copied from `globals.css`) and swapped via
 * `monaco.editor.setTheme()` whenever the app's own `data-theme`
 * attribute changes - unlike CodeMirror, which just referenced `var(--x)`
 * directly and needed no theme-switching code at all. That's the real
 * cost of this swap: Monaco doesn't merely reference the app's tokens the
 * way CodeMirror did, it needs its own theme registered and kept in sync.
 */

const LANGUAGE_ID = 'rune-latex';

const REFERENCE_COMMANDS = 'cite|ref|eqref|label|run|begin|end';

function registerLatexLanguage(monaco: typeof MonacoNS) {
  if (monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) return;

  monaco.languages.register({ id: LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [new RegExp(`(\\\\(?:${REFERENCE_COMMANDS}))(\\{)([^{}]*)(\\})`), ['keyword', 'delimiter.bracket', 'type', 'delimiter.bracket']],
        [/\\[a-zA-Z]+/, 'keyword'],
        [/[{}]/, 'delimiter.bracket'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: { lineComment: '%' },
    brackets: [['{', '}'], ['[', ']']],
    // Deliberately no autoClosingPairs: LaTeX is written with a lot of
    // manually-typed nested braces, and the toolbar/autocomplete already
    // insert matched pairs explicitly where that's wanted - auto-closing
    // on every typed `{` fought with both (confirmed live: it left a
    // phantom trailing `}` after `\begin{...}` autocomplete-acceptance).
  });
}

function registerLedgerThemes(monaco: typeof MonacoNS) {
  const base = (bg: string, fg: string, selection: string, cursor: string, lineHighlight: string) => ({
    base: 'vs' as const,
    inherit: false,
    rules: [
      { token: 'keyword', foreground: fg === '#23231f' ? '1f4d3e' : '469a78', fontStyle: 'bold' },
      { token: 'delimiter.bracket', foreground: fg === '#23231f' ? '67665a' : '8a877b' },
      { token: 'type', foreground: '45606b' },
      { token: 'comment', foreground: fg === '#23231f' ? '67665a' : '8a877b', fontStyle: 'italic' },
      { token: '', foreground: fg.replace('#', '') },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.selectionBackground': selection,
      'editorCursor.foreground': cursor,
      'editor.lineHighlightBackground': lineHighlight,
      'editorLineNumber.foreground': '#00000000',
      'editorLineNumber.activeForeground': '#00000000',
      'editorIndentGuide.background': '#00000000',
      'editorWhitespace.foreground': '#00000000',
    },
  });

  monaco.editor.defineTheme('ledger-light', base('#fbfaf7', '#23231f', '#e0e9e3', '#23231f', '#00000000'));
  monaco.editor.defineTheme('ledger-dark', base('#232320', '#ece9df', '#1f3a30', '#ece9df', '#00000000'));
}

export interface CaretCoords {
  top: number;
  left: number;
  lineHeight: number;
}

export type SpecialKey = 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Tab' | 'Escape' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export interface LatexEditorHandle {
  insertAtCursor: (before: string, after?: string) => void;
  replaceRange: (from: number, to: number, insertion: string, caretOffset: number) => void;
  getCursor: () => number;
  /** Moves the caret to a character offset - used by the outline/command palette to jump to a heading. */
  setCursorOffset: (offset: number, revealCenter?: boolean) => void;
  focus: () => void;
}

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorActivity: (value: string, pos: number, coords: CaretCoords) => void;
  onSpecialKey: (key: SpecialKey) => boolean;
  onPasteImage: (file: File) => void;
  /** Whether the parent's autocomplete popover is currently open - gates the special-key commands below (see the context-key comment further down) so ordinary arrow/Enter/Tab keys are only intercepted while there's actually a popover to navigate. */
  autocompleteOpen: boolean;
  placeholder?: string;
}

export const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(function LatexEditor(
  { value, onChange, onCursorActivity, onSpecialKey, onPasteImage, autocompleteOpen, placeholder: placeholderText },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNS | null>(null);
  const autocompleteOpenKeyRef = useRef<MonacoNS.editor.IContextKey<boolean> | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  const onChangeRef = useRef(onChange);
  const onCursorActivityRef = useRef(onCursorActivity);
  const onSpecialKeyRef = useRef(onSpecialKey);
  const onPasteImageRef = useRef(onPasteImage);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCursorActivityRef.current = onCursorActivity; }, [onCursorActivity]);
  useEffect(() => { onSpecialKeyRef.current = onSpecialKey; }, [onSpecialKey]);
  useEffect(() => { onPasteImageRef.current = onPasteImage; }, [onPasteImage]);
  useEffect(() => { autocompleteOpenKeyRef.current?.set(autocompleteOpen); }, [autocompleteOpen]);

  const emitCursorActivity = (editor: MonacoNS.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return;
    const pos = model.getOffsetAt(position);
    const coordsPx = editor.getScrolledVisiblePosition(position);
    const lineHeight = editor.getOption((monacoRef.current as typeof MonacoNS).editor.EditorOption.lineHeight);
    const coords: CaretCoords = coordsPx
      ? { top: coordsPx.top + coordsPx.height, left: coordsPx.left, lineHeight }
      : { top: 0, left: 0, lineHeight };
    onCursorActivityRef.current(model.getValue(), pos, coords);
  };

  useEffect(() => {
    let disposed = false;
    let editor: MonacoNS.editor.IStandaloneCodeEditor | null = null;
    const disposables: MonacoNS.IDisposable[] = [];

    (async () => {
      const monaco = await import('monaco-editor');
      if (disposed || !containerRef.current) return;
      monacoRef.current = monaco;

      // Base editor worker only - this language needs no TS/JSON/CSS
      // language-service workers, just the generic editor worker Monaco
      // uses for things like diffing.
      (self as unknown as { MonacoEnvironment: MonacoNS.Environment }).MonacoEnvironment = {
        getWorker: () =>
          new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' }),
      };

      registerLatexLanguage(monaco);
      registerLedgerThemes(monaco);

      const initialTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'ledger-dark' : 'ledger-light';
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';

      editor = monaco.editor.create(containerRef.current, {
        value,
        language: LANGUAGE_ID,
        theme: initialTheme,
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        wordWrap: 'on',
        renderLineHighlight: 'none',
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { vertical: 'auto', horizontal: 'hidden' },
        fontFamily,
        fontSize: 13,
        lineHeight: 22,
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        // Monaco 0.53's default text-input path uses the browser's newer
        // EditContext API. It's still catching up in non-Chromium browsers
        // and (confirmed live, not assumed) doesn't reliably receive
        // synthetic/automated keystrokes the same way real typing does -
        // for a self-hosted app that should work broadly, the older,
        // extremely well-tested textarea-based input path is the safer
        // default.
        editContext: false,
        // Hard-disabled rather than left to the language config: Monaco
        // falls back to auto-closing whatever the language's `brackets`
        // (bracket-matching) array declares even with no
        // `autoClosingPairs` supplied - confirmed live via the phantom
        // trailing `}` this produced after `\begin{...}` autocomplete.
        autoClosingBrackets: 'never',
        autoClosingQuotes: 'never',
        autoSurround: 'never',
      });
      editorRef.current = editor;
      // Always \n. Monaco picks the platform's line ending for an empty
      // document, so on Windows a new note was saved with \r\n - which the
      // LaTeX parser's patterns don't expect.
      editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
      setIsEmpty(!value);

      disposables.push(editor.onDidChangeModelContent(() => {
        const v = editor!.getValue();
        onChangeRef.current(v);
        setIsEmpty(!v);
        emitCursorActivity(editor!);
      }));
      disposables.push(editor.onDidChangeCursorPosition(() => emitCursorActivity(editor!)));

      // Special-key handling for the autocomplete popover, gated by a
      // context key rather than an unconditional override: `addCommand`'s
      // handler only runs while `runeAutocompleteOpen` is true, so when
      // the popover is closed these keybindings simply don't exist and
      // Monaco's own default cursor-movement/newline/tab behavior runs
      // completely untouched - no need to (buggily) hand-reimplement it.
      // The precondition style is deliberately picked over `addAction`,
      // which (a first attempt confirmed live) has no clean way to fall
      // through to the original command on "not consumed", corrupting
      // ordinary arrow-key/selection use whenever the popover was closed.
      autocompleteOpenKeyRef.current = editor.createContextKey('runeAutocompleteOpen', autocompleteOpen);
      const specialKeys: Array<[number, SpecialKey]> = [
        [monaco.KeyCode.UpArrow, 'ArrowUp'],
        [monaco.KeyCode.DownArrow, 'ArrowDown'],
        [monaco.KeyCode.Enter, 'Enter'],
        [monaco.KeyCode.Tab, 'Tab'],
        [monaco.KeyCode.Escape, 'Escape'],
        [monaco.KeyCode.LeftArrow, 'ArrowLeft'],
        [monaco.KeyCode.RightArrow, 'ArrowRight'],
        [monaco.KeyCode.Home, 'Home'],
        [monaco.KeyCode.End, 'End'],
      ];
      // ArrowLeft/Right/Home/End close the popover (a stale trigger/query
      // once the caret moves away) but should still move the caret
      // normally, matching `NotebookView`'s `handleSpecialKey` returning
      // `false` (not consumed) for exactly these four - so after closing,
      // re-trigger Monaco's own cursor command for them. The rest
      // (ArrowUp/Down/Enter/Tab/Escape) are fully consumed by the popover
      // while it's open.
      const fallThroughCommand: Partial<Record<SpecialKey, string>> = {
        ArrowLeft: 'cursorLeft',
        ArrowRight: 'cursorRight',
        Home: 'cursorHome',
        End: 'cursorEnd',
      };
      // If the popover didn't actually take the key (the context key can
      // lag a render behind the popover closing), the key does what it
      // normally does - Enter must never just vanish.
      const ifNotConsumed: Partial<Record<SpecialKey, () => void>> = {
        Enter: () => editor!.trigger('keyboard', 'type', { text: '\n' }),
        Tab: () => editor!.trigger('keyboard', 'tab', null),
        ArrowUp: () => editor!.trigger('keyboard', 'cursorUp', null),
        ArrowDown: () => editor!.trigger('keyboard', 'cursorDown', null),
      };
      for (const [keyCode, name] of specialKeys) {
        editor.addCommand(keyCode, () => {
          const consumed = onSpecialKeyRef.current(name);
          const fallThrough = fallThroughCommand[name];
          if (fallThrough) editor!.trigger('keyboard', fallThrough, null);
          else if (!consumed) ifNotConsumed[name]?.();
        }, 'runeAutocompleteOpen');
      }

      const domNode = editor.getDomNode();
      if (domNode) {
        domNode.addEventListener('paste', (event: ClipboardEvent) => {
          const items = event.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              const file = items[i].getAsFile();
              if (file) {
                event.preventDefault();
                event.stopPropagation();
                onPasteImageRef.current(file);
                return;
              }
            }
          }
        }, true);
      }

      const handleThemeChange = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        monaco.editor.setTheme(isDark ? 'ledger-dark' : 'ledger-light');
      };
      window.addEventListener('rune-theme-changed', handleThemeChange);
      disposables.push({ dispose: () => window.removeEventListener('rune-theme-changed', handleThemeChange) });
    })();

    return () => {
      disposed = true;
      disposables.forEach((d) => d.dispose());
      editor?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getValue();
    if (current === value) return;
    editor.setValue(value);
    // setValue re-detects the line ending from the new text (platform default if it has none).
    if (monacoRef.current) editor.getModel()?.setEOL(monacoRef.current.editor.EndOfLineSequence.LF);
    setIsEmpty(!value);
  }, [value]);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (before, after = '') => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || !model) return;
      const selected = model.getValueInRange(selection);
      const insertion = before + selected + after;
      editor.executeEdits('rune-toolbar', [{ range: selection, text: insertion }]);
      const startOffset = model.getOffsetAt(selection.getStartPosition());
      const newStart = model.getPositionAt(startOffset + before.length);
      const newEnd = model.getPositionAt(startOffset + before.length + selected.length);
      editor.setSelection(monaco.Range.fromPositions(newStart, newEnd));
      editor.focus();
    },
    replaceRange: (from, to, insertion, caretOffset) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;
      const range = monaco.Range.fromPositions(model.getPositionAt(from), model.getPositionAt(to));
      editor.executeEdits('rune-autocomplete', [{ range, text: insertion }]);
      const caretPos = model.getPositionAt(from + caretOffset);
      editor.setPosition(caretPos);
      editor.focus();
    },
    getCursor: () => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const position = editor?.getPosition();
      if (!editor || !model || !position) return 0;
      return model.getOffsetAt(position);
    },
    setCursorOffset: (offset, revealCenter = true) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const pos = model.getPositionAt(offset);
      editor.setPosition(pos);
      if (revealCenter) editor.revealPositionInCenter(pos);
      editor.focus();
    },
    focus: () => editorRef.current?.focus(),
  }), []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {isEmpty && placeholderText && (
        <div className="pointer-events-none absolute left-4 top-3 whitespace-pre-line text-sm text-ink-faint" style={{ fontFamily: 'var(--font-mono)' }}>
          {placeholderText}
        </div>
      )}
    </div>
  );
});
