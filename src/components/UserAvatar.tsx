'use client';

import { useState } from 'react';
import { AvatarArt, groundFor } from '@/components/avatars/AvatarArt';
import { defaultPresetFor, isUploadedPhoto, presetIdFromUrl } from '@/lib/avatars';

export interface AvatarPerson {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

/**
 * One person's avatar, everywhere a person appears: their uploaded photo,
 * the cartoon they picked, or - if neither, or the photo fails to load - a
 * default cartoon derived from who they are. Rounded square, not a circle,
 * to match the app's cards.
 *
 * Decorative by default (the name is almost always printed next to it);
 * pass `labelled` where the avatar stands alone.
 */
export function UserAvatar({
  person,
  size = 32,
  className = '',
  labelled = false,
}: {
  person: AvatarPerson | null | undefined;
  size?: number;
  className?: string;
  labelled?: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const url = person?.avatarUrl;
  const label = labelled ? person?.name || person?.email || 'User' : undefined;
  const radius = Math.max(6, Math.round(size * 0.28));

  if (isUploadedPhoto(url) && !photoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing for next/image to optimise
      <img
        src={url!}
        alt={label ?? ''}
        width={size}
        height={size}
        onError={() => setPhotoFailed(true)}
        className={`shrink-0 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  const preset = presetIdFromUrl(url) ?? defaultPresetFor(person?.id || person?.email || person?.name);
  const stroke = size < 28 ? 1.9 : size < 48 ? 1.45 : 1.15;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-foreground ${className}`}
      style={{ borderRadius: radius, background: groundFor(preset) }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <AvatarArt id={preset} ground={groundFor(preset)} />
    </svg>
  );
}
