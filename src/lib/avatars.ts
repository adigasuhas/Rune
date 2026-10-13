/**
 * Rune's cartoon avatars: original, diary-comic heads drawn in the same thin
 * pen line as the logo (art in src/components/avatars/AvatarArt.tsx).
 *
 * A chosen avatar is stored in `User.avatarUrl` as `rune:avatar/<id>`, next
 * to the other value that column can hold, an uploaded photo (a data: URL).
 * With neither - or a legacy generated robot from dicebear.com - a person
 * gets a default avatar picked from their id, so everyone has a face
 * without being asked anything. Labels describe the drawing only; nobody is
 * asked for a gender to get one.
 */

export interface AvatarPreset {
  id: string;
  label: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'spiky', label: 'Spiky hair' },
  { id: 'curly-glasses', label: 'Curly hair, round glasses' },
  { id: 'long', label: 'Long hair' },
  { id: 'bun-earrings', label: 'Top bun, earrings' },
  { id: 'buzz-beard', label: 'Buzz cut, beard' },
  { id: 'ponytail', label: 'Ponytail, freckles' },
  { id: 'bob-glasses', label: 'Bob, square glasses' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'side-part', label: 'Side part, moustache' },
  { id: 'braids', label: 'Two braids' },
  { id: 'headscarf', label: 'Headscarf' },
  { id: 'bald-glasses', label: 'Bald, round glasses' },
];

const PRESET_PREFIX = 'rune:avatar/';
const PRESET_IDS = new Set(AVATAR_PRESETS.map((p) => p.id));

export function presetAvatarUrl(id: string): string {
  return PRESET_PREFIX + id;
}

/** The preset id a stored avatarUrl points at, or null if it isn't a (known) preset. */
export function presetIdFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(PRESET_PREFIX)) return null;
  const id = url.slice(PRESET_PREFIX.length);
  return PRESET_IDS.has(id) ? id : null;
}

/** A stable default for someone who hasn't chosen: same person, same face, everywhere. */
export function defaultPresetFor(seed: string | null | undefined): string {
  let h = 2166136261;
  for (const ch of seed || 'rune') h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return AVATAR_PRESETS[(h >>> 0) % AVATAR_PRESETS.length].id;
}

/** An uploaded photo, as Settings stores it (a compressed data: URL). */
export function isUploadedPhoto(url: string | null | undefined): boolean {
  return !!url && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url);
}

/** Largest photo the API accepts; Settings compresses uploads to well under this. */
export const MAX_PHOTO_CHARS = 700_000;

/** What `PUT /api/user/avatar` will store: null, a known preset, or an uploaded photo. */
export function validateAvatarUrl(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Choose an avatar or upload a photo.' };
  if (presetIdFromUrl(value)) return { ok: true, value };
  if (isUploadedPhoto(value)) {
    if (value.length > MAX_PHOTO_CHARS) return { ok: false, error: 'That photo is too large. Try a smaller one.' };
    return { ok: true, value };
  }
  return { ok: false, error: 'Choose an avatar or upload a photo.' };
}
