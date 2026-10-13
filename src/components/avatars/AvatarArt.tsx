/**
 * Original cartoon heads for profile avatars, in the Rune mark's diary-comic
 * style: a big head with dot eyes, a fine pen line, solid ink only where
 * hair is dark. Drawn on a 48-unit grid inside a soft rounded square.
 *
 * Colours are theme tokens - ink is `currentColor`, the ground is one of the
 * soft tints - so every avatar works on light and dark pages alike. Layer
 * order per avatar: hair behind the head, shirt, head (filled with the
 * ground so anything behind it is hidden), face, then hair and accessories
 * in front.
 */

const GROUNDS = ['var(--primary-soft)', 'var(--warning-soft)', 'var(--info-soft)', 'var(--danger-soft)'];

const INK = 'currentColor';
/** Solid hair: coloured by the .av-hair class in globals.css (near-black, or warm grey on dark pages). */
const HAIR_CLASS = 'av-hair';

function Face({ mouth = 'smile' }: { mouth?: 'smile' | 'grin' | 'calm' }) {
  return (
    <>
      <circle cx="20.6" cy="22.6" r=".95" fill={INK} stroke="none" />
      <circle cx="27.4" cy="22.6" r=".95" fill={INK} stroke="none" />
      {mouth === 'smile' && <path d="M21.9 27c1.3 1 3 1 4.3 0" />}
      {mouth === 'grin' && <path d="M21.4 26.5c.9 1.9 4.3 1.9 5.2 0z" fill={INK} />}
      {mouth === 'calm' && <path d="M22.4 27.2c1.1.3 2.1.3 3.2 0" />}
    </>
  );
}

function Base({ ground, ears = true, children }: { ground: string; ears?: boolean; children?: React.ReactNode }) {
  return (
    <>
      {/* shirt and neck */}
      <path d="M22.5 31.2v3M25.5 31.2v3" />
      <path d="M9.5 49c.7-8 6.4-13.2 14.5-13.2S37.8 41 38.5 49" fill={ground} />
      <path d="M21 35.9c.9 1.6 1.9 2.3 3 2.3s2.1-.7 3-2.3" />
      {ears && <path d="M15.3 21c-1.6-.4-2.5 1.1-1.9 2.5.4.8 1.2 1.1 2 .9M32.7 21c1.6-.4 2.5 1.1 1.9 2.5-.4.8-1.2 1.1-2 .9" fill={ground} />}
      <ellipse cx="24" cy="22" rx="8.9" ry="9.4" fill={ground} />
      {children}
    </>
  );
}

function RoundGlasses() {
  return <path d="M18 22.6a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M24.8 22.6a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M23.2 22.4c.5-.4 1.1-.4 1.6 0" />;
}

function SquareGlasses() {
  return <path d="M17.9 20.7h5.3v3.9h-5.3zM24.8 20.7h5.3v3.9h-5.3zM23.2 21.9h1.6" />;
}

/** The drawing for one preset id. Unknown ids fall back to the first. */
export function AvatarArt({ id, ground }: { id: string; ground: string }) {
  switch (id) {
    case 'curly-glasses':
      return (
        <Base ground={ground}>
          <path d="M15.4 21.2c-1.9-1.4-1.7-4.3.3-5.3-.6-2.5 1.4-4.6 3.8-4.2.9-2.2 3.6-3 5.3-1.6 1.7-1.4 4.5-.8 5.2 1.3 2.4-.3 4.3 1.9 3.5 4.2 1.9 1.1 2.1 3.8.4 5.3-1.4-1.4-2.4-3.5-2.6-5.4-2.4 1.4-5.7 1.9-8.6 1.2-2.6-.6-4.2.6-5.1 2.6-.6 1-1.4 1.6-2.2 1.9z" fill={ground} />
          <Face mouth="grin" />
          <RoundGlasses />
        </Base>
      );
    case 'long':
      return (
        <>
          <path d="M14.2 37c-2.1-7.3-2.6-14.6.2-19.8 2-3.9 5.5-6 9.6-6s7.6 2.1 9.6 6c2.8 5.2 2.3 12.5.2 19.8z" className={HAIR_CLASS} />
          <Base ground={ground} ears={false}>
            <path d="M15.1 21.6c.3-6.2 4-9.8 8.9-9.8s8.6 3.6 8.9 9.8c-3.4-.7-6.5-2.8-8.3-5.8-1.8 3.1-5.5 5.3-9.5 5.8z" className={HAIR_CLASS} />
            <Face />
          </Base>
        </>
      );
    case 'bun-earrings':
      return (
        <>
          <circle cx="24" cy="10.4" r="3.3" className={HAIR_CLASS} />
          <Base ground={ground}>
            <path d="M15.1 20.8c.4-5.4 4.2-8.6 8.9-8.6s8.5 3.2 8.9 8.6c-2.8-2-5.6-3.6-8.9-3.6s-6.1 1.6-8.9 3.6z" className={HAIR_CLASS} />
            <Face mouth="grin" />
            <circle cx="14.6" cy="26.2" r="1" />
            <circle cx="33.4" cy="26.2" r="1" />
          </Base>
        </>
      );
    case 'buzz-beard':
      return (
        <Base ground={ground}>
          <path d="M15.4 19.6c1-4.8 4.4-7.4 8.6-7.4s7.6 2.6 8.6 7.4" />
          <path d="M18.4 15.4l.4.6M21.4 13.9l.2.7M24.6 13.5v.7M27.6 14l-.2.7M30.2 15.6l-.4.6" />
          <path d="M15.4 24.4c.4 5.8 3.9 8.8 8.6 8.8s8.2-3 8.6-8.8c-1.8 1.8-3.8 2.5-5.2 2.5-1.1 0-2.1-.6-3.4-.6s-2.3.6-3.4.6c-1.4 0-3.4-.7-5.2-2.5z" className={HAIR_CLASS} />
          <circle cx="20.6" cy="22.4" r=".95" fill={INK} stroke="none" />
          <circle cx="27.4" cy="22.4" r=".95" fill={INK} stroke="none" />
          <path d="M22.2 28.6c1.2.6 2.4.6 3.6 0" stroke={ground} />
        </Base>
      );
    case 'ponytail':
      return (
        <>
          <path d="M30.6 14.4c4.9.3 7.8 4.1 7.2 9.8-.4 3.8-2.1 6.4-4.5 7.6 1.1-3.4 1.1-6.8-.4-10.2z" className={HAIR_CLASS} />
          <Base ground={ground}>
            <path d="M15.1 21c.3-5.6 4.2-8.9 8.9-8.9s8.6 3.3 8.9 8.9c-3.6-.8-7.1-2.6-9.3-5.2-1.8 2.5-4.6 4.4-8.5 5.2z" className={HAIR_CLASS} />
            <Face />
            <path d="M18.3 25.3h.01M19.3 26.1h.01M17.6 26.3h.01M29.7 25.3h.01M28.7 26.1h.01M30.4 26.3h.01" strokeWidth="1.1" />
          </Base>
        </>
      );
    case 'bob-glasses':
      return (
        <>
          <path d="M14 30.4c-1-5.8-.8-11.2 1.3-14.9 2-3.5 5.1-5.2 8.7-5.2s6.7 1.7 8.7 5.2c2.1 3.7 2.3 9.1 1.3 14.9z" className={HAIR_CLASS} />
          <Base ground={ground} ears={false}>
            <path d="M15.1 19.8c.6-4.8 4.1-7.7 8.9-7.7s8.3 2.9 8.9 7.7z" className={HAIR_CLASS} />
            <Face mouth="calm" />
            <SquareGlasses />
          </Base>
        </>
      );
    case 'beanie':
      return (
        <Base ground={ground}>
          <path d="M14.8 19.6c.4-5.8 4.4-9.3 9.2-9.3s8.8 3.5 9.2 9.3z" fill={ground} />
          <path d="M14.2 19.4c6.5-1.1 13.1-1.1 19.6 0l.2 2.7c-6.7-1.1-13.3-1.1-20 0z" fill={ground} />
          <path d="M18.6 14.4l.7 4.4M22.2 12.6l.3 5.4M25.8 12.6l-.3 5.4M29.4 14.4l-.7 4.4" opacity=".6" />
          <circle cx="24" cy="9" r="1.7" fill={ground} />
          <Face mouth="smile" />
        </Base>
      );
    case 'side-part':
      return (
        <Base ground={ground}>
          <path d="M15.1 20.6c-.3-5.3 3.4-8.8 8.8-8.8 5 0 8.9 2.9 9.6 7.9-3.8-.2-6.9-1.7-8.7-4.2-1.7 2.5-5.1 4.4-9.7 5.1z" className={HAIR_CLASS} />
          <Face mouth="calm" />
          <path d="M21 25.6c1-.8 2-.8 3-.2 1-.6 2-.6 3 .2" />
        </Base>
      );
    case 'braids':
      return (
        <>
          <path d="M15.6 24.6c-.9 3.4-.7 7.6.4 11.2M32.4 24.6c.9 3.4.7 7.6-.4 11.2" />
          {[26.5, 29.3, 32.1, 34.9].map((y) => (
            <g key={y} className={HAIR_CLASS} stroke="none">
              <ellipse cx="15.6" cy={y} rx="1.6" ry="1.5" />
              <ellipse cx="32.4" cy={y} rx="1.6" ry="1.5" />
            </g>
          ))}
          <Base ground={ground}>
            <path d="M15.1 21.4c.3-5.8 4.2-9.3 8.9-9.3s8.6 3.5 8.9 9.3c-2.1-1.6-3.6-3.4-4.4-5.5-1.4 1.1-2.9 1.6-4.5 1.6s-3.1-.5-4.5-1.6c-.8 2.1-2.3 3.9-4.4 5.5z" className={HAIR_CLASS} />
            <Face mouth="grin" />
          </Base>
        </>
      );
    case 'headscarf':
      return (
        <>
          <path d="M22.5 31.2v3M25.5 31.2v3" />
          <path d="M9.5 49c.7-8 6.4-13.2 14.5-13.2S37.8 41 38.5 49" fill={ground} />
          <path d="M13.6 24.4c-.5-8.4 4.3-14 10.4-14s10.9 5.6 10.4 14c-.3 5.2-2.2 9.8-5 12.8H18.6c-2.8-3-4.7-7.6-5-12.8z" fill={ground} />
          <path d="M14.2 17.6c3.2 1.6 6.6 2.3 9.8 2.3s6.6-.7 9.8-2.3M18.6 37.2c1.6-1.6 3.4-2.4 5.4-2.4s3.8.8 5.4 2.4" opacity=".6" />
          <ellipse cx="24" cy="24.2" rx="7.4" ry="8.1" fill={ground} />
          <g transform="translate(0 1.4)"><Face /></g>
        </>
      );
    case 'bald-glasses':
      return (
        <Base ground={ground}>
          <path d="M19.6 14.6c1.2-.8 2.6-1.2 4-1.3" opacity=".55" />
          <Face mouth="smile" />
          <RoundGlasses />
        </Base>
      );
    case 'spiky':
    default:
      return (
        <Base ground={ground}>
          <path d="M22.4 12.8c-.6-1.3-.6-2.7 0-3.8M24.6 12.6c0-1.3.5-2.6 1.4-3.4M26.8 13.1c.5-1.1 1.3-1.8 2.3-2.2" />
          <Face mouth="grin" />
        </Base>
      );
  }
}

/** The ground tint for a preset - fixed per preset so a face keeps its colour. */
export function groundFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUNDS[h % GROUNDS.length];
}
