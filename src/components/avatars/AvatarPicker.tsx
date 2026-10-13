'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useSession } from '@/context/SessionContext';
import { AVATAR_PRESETS, defaultPresetFor, isUploadedPhoto, presetAvatarUrl, presetIdFromUrl } from '@/lib/avatars';

/**
 * Choose one of Rune's cartoon avatars. Saves on click (there's nothing to
 * confirm), shows which one is in use - including the default someone has
 * without ever choosing - and says so plainly if the save fails.
 */
export function AvatarPicker({ size = 52 }: { size?: number }) {
  const { user, refreshSession } = useSession();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPhoto = isUploadedPhoto(user?.avatarUrl);
  const current = hasPhoto ? null : presetIdFromUrl(user?.avatarUrl) ?? defaultPresetFor(user?.id || user?.email || user?.name);

  const choose = async (id: string) => {
    if (saving) return;
    setSaving(id);
    setError(null);
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: presetAvatarUrl(id) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn’t save your avatar.');
      await refreshSession();
    } catch (e) {
      setError(e instanceof TypeError ? 'Couldn’t reach Rune. Check your connection and try again.' : (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Avatar" className="flex flex-wrap gap-2.5">
        {AVATAR_PRESETS.map((p) => {
          const selected = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.label}
              title={p.label}
              disabled={!!saving}
              onClick={() => choose(p.id)}
              className={`relative rounded-[16px] p-0.5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait ${
                selected ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-border-strong'
              } ${saving === p.id ? 'opacity-60' : ''}`}
            >
              <UserAvatar person={{ id: p.id, avatarUrl: presetAvatarUrl(p.id) }} size={size} />
              {selected && (
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hasPhoto && <p className="mt-2 text-[12.5px] text-ink-secondary">You’re using your own photo. Choose a drawing to use that instead.</p>}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
