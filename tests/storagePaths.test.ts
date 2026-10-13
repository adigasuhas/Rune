import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { localUploadDir } from '@/lib/storage';

const saved = { data: process.env.RUNE_DATA_DIR, upload: process.env.RUNE_UPLOAD_DIR };
afterEach(() => {
  for (const [k, v] of [['RUNE_DATA_DIR', saved.data], ['RUNE_UPLOAD_DIR', saved.upload]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('localUploadDir', () => {
  it('defaults to ./data/uploads', () => {
    delete process.env.RUNE_DATA_DIR;
    delete process.env.RUNE_UPLOAD_DIR;
    expect(localUploadDir()).toBe(path.join(process.cwd(), 'data', 'uploads'));
  });

  it('follows RUNE_DATA_DIR, so uploads land on the persistent volume in Docker', () => {
    process.env.RUNE_DATA_DIR = '/data';
    delete process.env.RUNE_UPLOAD_DIR;
    expect(localUploadDir()).toBe(path.join('/data', 'uploads'));
  });

  it('RUNE_UPLOAD_DIR overrides everything', () => {
    process.env.RUNE_DATA_DIR = '/data';
    process.env.RUNE_UPLOAD_DIR = '/mnt/files';
    expect(localUploadDir()).toBe('/mnt/files');
  });
});
