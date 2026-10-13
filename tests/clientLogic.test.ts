import { describe, it, expect } from 'vitest';
import { detectAutocompleteTrigger, filterAutocompleteItems } from '@/lib/latex/autocompleteTrigger';
import { detectMentionTrigger, filterMentionCandidates, buildMentionHighlightPattern } from '@/lib/chatMentions';

describe('detectAutocompleteTrigger', () => {
  it('detects an open \\cite{ and captures the partial key', () => {
    const text = 'See \\cite{smi';
    expect(detectAutocompleteTrigger(text, text.length)).toEqual({ kind: 'cite', queryStart: 10, query: 'smi' });
  });

  it('detects \\ref{ and \\eqref{ as the same "ref" kind', () => {
    const a = 'See \\ref{sec';
    const b = 'See \\eqref{eq';
    expect(detectAutocompleteTrigger(a, a.length)?.kind).toBe('ref');
    expect(detectAutocompleteTrigger(b, b.length)?.kind).toBe('ref');
  });

  it('detects \\begin{ and \\run{', () => {
    const a = '\\begin{ali';
    const b = 'See \\run{DFT';
    expect(detectAutocompleteTrigger(a, a.length)?.kind).toBe('begin');
    expect(detectAutocompleteTrigger(b, b.length)?.kind).toBe('run');
  });

  it('is comma-aware for multi-key \\cite{a,b,partial - only the last segment is the query', () => {
    const text = '\\cite{smith2025,jones2024,par';
    const result = detectAutocompleteTrigger(text, text.length);
    expect(result?.query).toBe('par');
    expect(result?.queryStart).toBe(text.length - 3);
  });

  it('returns null once the argument is closed with }', () => {
    const text = '\\cite{smith2025} and more text';
    expect(detectAutocompleteTrigger(text, text.length)).toBeNull();
  });

  it('returns null with no backslash command in progress', () => {
    expect(detectAutocompleteTrigger('just plain text', 15)).toBeNull();
  });

  it('does not cross a newline into a previous line\'s brace', () => {
    const text = '\\cite{oldkey\nsome new text';
    expect(detectAutocompleteTrigger(text, text.length)).toBeNull();
  });
});

describe('filterAutocompleteItems', () => {
  const items = [
    { key: 'smith2025', label: 'Smith, 2025' },
    { key: '0c9c45e4-e24c-4f04-b15c-01431e2e3c6b', label: 'DFT convergence sweep · Completed' },
  ];

  it('returns the full pool for an empty query', () => {
    expect(filterAutocompleteItems(items, '')).toHaveLength(2);
  });

  it('matches against the key (citations/labels)', () => {
    expect(filterAutocompleteItems(items, 'smith')).toEqual([items[0]]);
  });

  it('also matches against the label - the fix for \\run{, whose key is an opaque id nobody types', () => {
    expect(filterAutocompleteItems(items, 'dft')).toEqual([items[1]]);
    expect(filterAutocompleteItems(items, 'DFT')).toEqual([items[1]]);
  });

  it('caps results at the given limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, label: `l${i}` }));
    expect(filterAutocompleteItems(many, '', 8)).toHaveLength(8);
  });
});

describe('detectMentionTrigger', () => {
  it('detects a trailing @partial', () => {
    expect(detectMentionTrigger('Hey @Pri')).toBe('Pri');
  });

  it('detects a bare trailing @ with an empty query', () => {
    expect(detectMentionTrigger('Hey @')).toBe('');
  });

  it('returns null once a space follows the @mention', () => {
    expect(detectMentionTrigger('Hey @Priya and')).toBeNull();
  });

  it('returns null with no @ at all', () => {
    expect(detectMentionTrigger('just a message')).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  const candidates = [
    { userId: 'u1', label: 'Priya Patel' },
    { userId: 'u2', label: 'Priyanka Rao' },
    { userId: 'u3', label: 'Suhas Adiga' },
  ];

  it('is case-insensitive and substring-based', () => {
    expect(filterMentionCandidates(candidates, 'pri').map((c) => c.userId)).toEqual(['u1', 'u2']);
  });

  it('caps at the given limit', () => {
    expect(filterMentionCandidates(candidates, '', 1)).toHaveLength(1);
  });
});

describe('buildMentionHighlightPattern', () => {
  it('returns null with no names', () => {
    expect(buildMentionHighlightPattern([])).toBeNull();
  });

  it('matches the longest name first so a short name cannot shadow-match inside a longer one', () => {
    const pattern = buildMentionHighlightPattern(['Jo', 'Joanna Smith']);
    const text = 'cc @Joanna Smith please';
    const match = pattern!.exec(text);
    expect(match?.[1]).toBe('Joanna Smith');
  });

  it('escapes regex-special characters in a display name', () => {
    const pattern = buildMentionHighlightPattern(['Dr. Smith (Lab)']);
    expect('@Dr. Smith (Lab) hi'.match(pattern!)?.[0]).toBe('@Dr. Smith (Lab)');
  });
});
