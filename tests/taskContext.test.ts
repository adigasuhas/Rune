import { describe, it, expect } from 'vitest';
import { contextLabel, contextsText, hasContext, joinContexts, normalizeContext, ownContextsByUse, parseContexts, MAX_CONTEXTS } from '@/lib/taskContext';

describe('task contexts', () => {
  it('a task saved with one context is a list of one', () => {
    expect(parseContexts('COMPUTER')).toEqual(['COMPUTER']);
    expect(parseContexts('BENCH WORK')).toEqual(['BENCH WORK']);
    expect(parseContexts('')).toEqual([]);
    expect(parseContexts(null)).toEqual([]);
  });

  it('several are stored comma-separated, cleaned and without repeats', () => {
    expect(joinContexts(['Computer', ' writing ', 'COMPUTER', '', 'bench   work'])).toBe('COMPUTER,WRITING,BENCH WORK');
    expect(parseContexts(' computer , ,Writing,computer')).toEqual(['COMPUTER', 'WRITING']);
  });

  it('a typed context can’t smuggle in a separator, and is capped', () => {
    expect(normalizeContext('calls; email|chat')).toBe('CALLS EMAIL CHAT');
    expect(normalizeContext('x'.repeat(80))).toHaveLength(32);
    expect(parseContexts(Array.from({ length: 20 }, (_, i) => `c${i}`))).toHaveLength(MAX_CONTEXTS);
  });

  it('reads as words, and filters by any of them', () => {
    expect(contextLabel('CODING')).toBe('Coding');
    expect(contextLabel('BENCH WORK')).toBe('Bench work');
    expect(contextsText('COMPUTER,BENCH WORK')).toBe('Computer, Bench work');
    expect(hasContext('COMPUTER,WRITING', 'writing')).toBe(true);
    expect(hasContext('COMPUTER', 'WRITING')).toBe(false);
  });

  it('offers the writer’s own contexts, most used first', () => {
    const tasks = [{ context: 'COMPUTER,BENCH WORK' }, { context: 'BEAMLINE,BENCH WORK' }, { context: 'READING' }];
    expect(ownContextsByUse(tasks)).toEqual(['BENCH WORK', 'BEAMLINE']);
  });
});
