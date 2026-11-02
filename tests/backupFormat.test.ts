import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { isBackupDue, safeFileName, csvCell, toCsv, backupFileName, buildZip, readme } from '@/lib/backups/format';
import { readBackupFile } from '@/components/backups/BackupPanels';

describe('isBackupDue', () => {
  const UTC = 'UTC';
  const at = (iso: string) => new Date(iso);

  it('never when off; at once when there has been none', () => {
    expect(isBackupDue('OFF', null, at('2026-11-02T10:00:00Z'), UTC)).toBe(false);
    expect(isBackupDue('DAILY', null, at('2026-11-02T10:00:00Z'), UTC)).toBe(true);
  });

  it('daily: once per calendar day, not per 24 hours', () => {
    expect(isBackupDue('DAILY', at('2026-11-02T00:10:00Z'), at('2026-11-02T23:50:00Z'), UTC)).toBe(false);
    expect(isBackupDue('DAILY', at('2026-11-02T23:50:00Z'), at('2026-11-03T00:10:00Z'), UTC)).toBe(true);
  });

  it('uses the user\'s time zone for the day', () => {
    // 20:00 UTC on the 2nd is already the 3rd in Kolkata (+5:30).
    expect(isBackupDue('DAILY', at('2026-11-02T10:00:00Z'), at('2026-11-02T20:00:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(isBackupDue('DAILY', at('2026-11-02T10:00:00Z'), at('2026-11-02T20:00:00Z'), UTC)).toBe(false);
  });

  it('weekly: a new ISO week starts on Monday', () => {
    // Sun 8 Nov -> Mon 9 Nov 2026
    expect(isBackupDue('WEEKLY', at('2026-11-02T09:00:00Z'), at('2026-11-08T22:00:00Z'), UTC)).toBe(false);
    expect(isBackupDue('WEEKLY', at('2026-11-08T22:00:00Z'), at('2026-11-09T01:00:00Z'), UTC)).toBe(true);
  });

  it('monthly: a new calendar month, across year ends', () => {
    expect(isBackupDue('MONTHLY', at('2026-11-01T09:00:00Z'), at('2026-11-30T22:00:00Z'), UTC)).toBe(false);
    expect(isBackupDue('MONTHLY', at('2026-12-31T09:00:00Z'), at('2027-01-01T09:00:00Z'), UTC)).toBe(true);
  });
});

describe('file names', () => {
  it('makes names safe everywhere and unique', () => {
    const taken = new Set<string>();
    expect(safeFileName('Growth: Cs3Sb / Sb?', taken, '.tex')).toBe('Growth- Cs3Sb - Sb-.tex');
    expect(safeFileName('Notes', taken, '.tex')).toBe('Notes.tex');
    expect(safeFileName('notes', taken, '.tex')).toBe('notes (2).tex');
    expect(safeFileName('...', taken)).toBe('Untitled');
    expect(safeFileName('a'.repeat(200), new Set())).toHaveLength(80);
  });

  it('dates the .zip in the user\'s time and names projects by slug', () => {
    const now = new Date('2026-11-02T22:30:00Z');
    expect(backupFileName(now, 'UTC')).toBe('rune-backup-2026-11-02-2230.zip');
    expect(backupFileName(now, 'Asia/Kolkata')).toBe('rune-backup-2026-11-03-0400.zip');
    expect(backupFileName(now, 'UTC', 'Thesis: Cs₃Sb photocathodes')).toBe('rune-project-thesis-cs3sb-photocathodes-2026-11-02-2230.zip');
  });
});

describe('CSV', () => {
  it('quotes when needed and defuses spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell(null)).toBe('');
    expect(toCsv(['A', 'B'], [[1, 'x\ny']])).toBe('﻿A,B\r\n1,"x\ny"\r\n');
  });
});

describe('the .zip', () => {
  it('puts everything under one folder and reads back intact', () => {
    const zip = buildZip('rune-backup-2026-11-02-1530', {
      'README.txt': 'hello',
      'notebooks/Personal/Notes.tex': '\\section{$\\text{Cs}_3$}',
      'notebooks/Personal/Notes files/plot.png': new Uint8Array([137, 80, 78, 71]),
    });
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual([
      'rune-backup-2026-11-02-1530/README.txt',
      'rune-backup-2026-11-02-1530/notebooks/Personal/Notes files/plot.png',
      'rune-backup-2026-11-02-1530/notebooks/Personal/Notes.tex',
    ]);
    expect(strFromU8(out['rune-backup-2026-11-02-1530/notebooks/Personal/Notes.tex'])).toBe('\\section{$\\text{Cs}_3$}');
    expect([...out['rune-backup-2026-11-02-1530/notebooks/Personal/Notes files/plot.png']]).toEqual([137, 80, 78, 71]);
  });

  it('README says what is inside and how to restore', () => {
    const text = readme({ title: 'Rune backup', createdAt: new Date('2026-11-02T10:00:00Z'), timezone: 'UTC', scope: 'account', summary: { notebooks: 2, tasks: 1, attachments: 0, skippedAttachments: 0, fullCopy: true } });
    expect(text).toContain('2 notebooks');
    expect(text).toContain('1 task.');
    expect(text).toContain('Restore backup');
  });
});

describe('restoring from a .zip', () => {
  it('finds rune-backup.json inside the .zip, or reports there is none', async () => {
    const withCopy = buildZip('b', { 'README.txt': 'x', 'rune-backup.json': '{"version":"1.0"}' });
    const without = buildZip('b', { 'README.txt': 'x' });
    expect(await readBackupFile(new File([new Uint8Array(withCopy)], 'b.zip', { type: 'application/zip' }))).toBe('{"version":"1.0"}');
    expect(await readBackupFile(new File([new Uint8Array(without)], 'b.zip'))).toBeNull();
    expect(await readBackupFile(new File(['{"version":"1.0"}'], 'b.json'))).toBe('{"version":"1.0"}');
  });
});
