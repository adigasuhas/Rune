import { describe, it, expect } from 'vitest';
import { validateBackup, BackupError, MAX_ROWS } from '@/lib/backup';

const valid = {
  version: '1.0',
  projects: [{ id: 'p1', name: 'Rigidity study', status: 'ACTIVE' }],
  tasks: [{ id: 't1', name: 'Analyse batch 3' }],
  notebooks: [],
  accomplishments: [],
  calendarEvents: [],
  instruments: [],
  jobs: [],
  notifications: [],
};

describe('validateBackup', () => {
  it('accepts a well-formed export and passes fields through', () => {
    const out = validateBackup(valid);
    expect(out.projects[0].name).toBe('Rigidity study');
    expect(out.tasks[0].name).toBe('Analyse batch 3');
  });

  it('rejects a non-object', () => {
    expect(() => validateBackup('nope')).toThrow(BackupError);
    expect(() => validateBackup([1, 2, 3])).toThrow(BackupError);
    expect(() => validateBackup(null)).toThrow(BackupError);
  });

  it('rejects an unknown version', () => {
    expect(() => validateBackup({ ...valid, version: '2.0' })).toThrow(/version/i);
  });

  it('rejects a malformed collection', () => {
    expect(() => validateBackup({ ...valid, tasks: { not: 'an array' } })).toThrow(/malformed/i);
  });

  it('strips server-owned and relation keys at any depth', () => {
    const out = validateBackup({
      ...valid,
      projects: [{ id: 'p1', name: 'x', userId: 'someone-else', createdAt: '2020', user: { id: 'x' }, _internal: 1 }],
      notebooks: [{ id: 'n1', title: 'N', userId: 'x', pages: [{ id: 'pg', title: 'P', userId: 'x', createdAt: '2020' }] }],
    });
    expect(out.projects[0]).not.toHaveProperty('userId');
    expect(out.projects[0]).not.toHaveProperty('createdAt');
    expect(out.projects[0]).not.toHaveProperty('user');
    expect(out.projects[0]).not.toHaveProperty('_internal');
    expect(out.notebooks[0].pages[0]).not.toHaveProperty('userId');
    expect(out.notebooks[0].pages[0]).not.toHaveProperty('createdAt');
  });

  it('caps collection size', () => {
    const huge = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: String(i), name: 'x' }));
    expect(() => validateBackup({ ...valid, tasks: huge })).toThrow(/more records/i);
  });

  it('caps individual string size', () => {
    expect(() => validateBackup({ ...valid, tasks: [{ id: 't', name: 'a'.repeat(2_000_001) }] })).toThrow(/too large/i);
  });

  it('treats missing collections as empty', () => {
    const out = validateBackup({ version: '1.0' });
    expect(out.tasks).toEqual([]);
    expect(out.projects).toEqual([]);
  });
});
