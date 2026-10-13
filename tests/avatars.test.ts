import { describe, it, expect } from 'vitest';
import { AVATAR_PRESETS, defaultPresetFor, isUploadedPhoto, presetAvatarUrl, presetIdFromUrl, validateAvatarUrl } from '@/lib/avatars';

describe('avatars', () => {
  it('has twelve distinct presets, each labelled by the drawing, not a gender', () => {
    expect(new Set(AVATAR_PRESETS.map((p) => p.id)).size).toBe(12);
    for (const p of AVATAR_PRESETS) expect(p.label).not.toMatch(/\b(male|female|man|woman|boy|girl|masculine|feminine)\b/i);
  });

  it('round-trips a preset through its stored form, and rejects unknown ids', () => {
    expect(presetIdFromUrl(presetAvatarUrl('beanie'))).toBe('beanie');
    expect(presetIdFromUrl('rune:avatar/not-a-real-one')).toBeNull();
    expect(presetIdFromUrl('https://api.dicebear.com/7.x/bottts/svg?seed=x')).toBeNull();
  });

  it('gives the same person the same default every time, and spreads people across the set', () => {
    expect(defaultPresetFor('user-123')).toBe(defaultPresetFor('user-123'));
    const used = new Set(Array.from({ length: 200 }, (_, i) => defaultPresetFor(`user-${i}`)));
    expect(used.size).toBeGreaterThan(8);
  });

  it('accepts only a preset, an uploaded photo, or nothing', () => {
    expect(validateAvatarUrl(null)).toEqual({ ok: true, value: null });
    expect(validateAvatarUrl('')).toEqual({ ok: true, value: null });
    expect(validateAvatarUrl('rune:avatar/long')).toEqual({ ok: true, value: 'rune:avatar/long' });
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    expect(isUploadedPhoto(photo)).toBe(true);
    expect(validateAvatarUrl(photo)).toEqual({ ok: true, value: photo });
    for (const bad of ['https://tracker.example/pixel.png', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 42, 'rune:avatar/../../x']) {
      expect(validateAvatarUrl(bad).ok).toBe(false);
    }
    expect(validateAvatarUrl('data:image/png;base64,' + 'A'.repeat(800_000)).ok).toBe(false);
  });
});
