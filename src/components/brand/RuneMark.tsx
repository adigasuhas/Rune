/**
 * The Rune mark: one small person, four arms, four jobs - coffee, an
 * experiment, a notebook, a laptop - and the top of their head flipped open
 * like a lid, with the day's tasks spilling out. One person, too many
 * things, and a few extra hands.
 *
 * Drawn like a diary-comic character on a 48-unit grid: a big head with dot
 * eyes, ears and three hairs (on the lid), a t-shirt, thin limbs and shoes,
 * in a single thin pen line. Two arms come out of the sleeves; the other
 * two are the extra hands.
 * Everything is `currentColor`, so it follows the text colour in both
 * themes; the only colour is pine (`--primary`): the flask's liquid and the
 * tick on the one task that's done.
 *
 * Line weight is set optically, not geometrically: the stroke is converted
 * so it *renders* at roughly 1-1.6px whatever the size - a fine pen line
 * whether the drawing is a stamp or a poster.
 *
 * Below ~24px the props turn to noise, so `RuneGlyph` - the same character
 * on a 16-unit grid, no props, one pine dot for the flask - is used instead
 * (also the favicon; see src/app/icon.svg). Under 40px the thoughts above
 * the head are drawn as three simple marks rather than three objects.
 *
 * `animated`: the thoughts jostle for room above the open head, then settle
 * into a tidy row (the organised state is also the static one, and what
 * reduced-motion users see); the hands lift in turn, the coffee steams, and
 * now and then they blink. Transform/opacity only.
 */

function renderedStroke(size: number): number {
  if (size < 40) return 1;
  if (size < 80) return 1.05;
  if (size < 140) return 1.2;
  return 1.45;
}

/** Head, face, t-shirt, legs and shoes - shared with the landing comic (LabStory). */
export function RuneBody({ eyes, openHead = false }: { eyes?: React.ReactNode; openHead?: boolean }) {
  return (
    <>
      {openHead ? (
        <>
          {/* Head below the hairline, open at the top: the rim is the opening. */}
          <path d="M17.5 8.6A7.5 7 0 1 0 30.7 8.6" fill="var(--rune-fill, none)" />
          <ellipse cx="24.1" cy="8.6" rx="6.6" ry="1" />
          {/* The crown, flipped open on a hinge at the left temple, hairs and all. */}
          <g className="rm-lid" transform="rotate(-100 17.5 8.6)">
            <path d="M17.5 8.6A7.5 7 0 0 1 30.7 8.6a6.6 1 0 0 1-13.2 0z" fill="var(--rune-fill, none)" />
            <path d="M22.3 5.1c-.5-1-.5-2 0-2.9M24.4 4.9c0-1 .4-1.9 1.1-2.5M26.5 5.4c.4-.8 1-1.3 1.8-1.6" />
          </g>
        </>
      ) : (
        <path d="M24.1 4.9c4.4-.1 7.7 3 7.6 7.1-.1 4-3.5 7-7.8 6.9-4.2 0-7.5-3.1-7.4-7.1.1-3.9 3.4-6.8 7.6-6.9z" fill="var(--rune-fill, none)" />
      )}
      <path d="M16.6 10.6c-1.4-.3-2.2 1.1-1.6 2.3.3.6 1 .9 1.7.7M31.6 10.6c1.4-.3 2.2 1.1 1.6 2.3-.3.6-1 .9-1.7.7" />
      {!openHead && <path d="M22.3 5.1c-.5-1-.5-2 0-2.9M24.4 4.9c0-1 .4-1.9 1.1-2.5M26.5 5.4c.4-.8 1-1.3 1.8-1.6" />}
      {eyes ?? (
        <g className="rm-eyes" fill="currentColor" stroke="none">
          <circle cx="21.3" cy="11.4" r=".85" />
          <circle cx="26.7" cy="11.4" r=".85" />
        </g>
      )}
      <path d="M24 18.9v1.4" />
      <path d="M20.6 20.6c2.2-.6 4.6-.6 6.8 0l.5 10.2c-2.6.6-5.2.6-7.8 0z" fill="var(--rune-fill, none)" />
      <path d="M20.7 20.6c-.9.4-1.6 1.1-2.1 2l1.6.9M27.3 20.6c.9.4 1.6 1.1 2.1 2l-1.6.9" />
      <path d="M22.8 20.4c.4.9.8 1.3 1.2 1.3s.8-.4 1.2-1.3" />
      <path d="M22.3 31.2l-.5 9.1M25.7 31.2l.5 9.1" />
      <path d="M21.8 40.3c-1.7-.1-2.9.4-2.9 1.1 0 .6 1.3.8 2.9.6.6-.1.9-.5.9-.9s-.3-.8-.9-.8zM26.2 40.3c1.7-.1 2.9.4 2.9 1.1 0 .6-1.3.8-2.9.6-.6-.1-.9-.5-.9-.9s.3-.8.9-.8z" />
    </>
  );
}

export function RuneMark({ size = 32, animated = false, className = '', title }: { size?: number; animated?: boolean; className?: string; title?: string }) {
  if (size <= 24) return <RuneGlyph size={size} className={className} title={title} />;
  const sw = (renderedStroke(size) * 48) / size;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${animated ? 'rune-mark-anim' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The person, scaled down a touch to leave room above the open head. */}
      <g transform="translate(2.6 5.4) scale(.89)">
        <RuneBody openHead />
        <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
        {/* coffee */}
        <g className="rm-arm rm-arm-1">
          <path d="M19.4 22.2c-1.7-.1-3.3-.8-4.8-2.2" />
          <path d="M7.6 15.4h6.4v4.2a2.2 2.2 0 0 1-2.2 2.2h-2a2.2 2.2 0 0 1-2.2-2.2zM7.6 16.7H6.6a1.4 1.4 0 0 0 0 2.8h1" />
          <path className="rm-steam" d="M9.8 10.9c-.7.9.7 1.6 0 2.5M12 10.9c-.7.9.7 1.6 0 2.5" opacity=".7" />
        </g>
        {/* experiment */}
        <g className="rm-arm rm-arm-2">
          <path d="M28.6 22.2c1.9-.6 3.5-1.6 4.9-3.4" />
          <path d="M35.2 6.4h4.4M35.9 6.4v4.4l-3.1 5.3a1.1 1.1 0 0 0 1 1.7h7.2a1.1 1.1 0 0 0 1-1.7l-3.1-5.3V6.4" />
          <path d="M33.9 13.9h6.8l1.4 2.4a.7.7 0 0 1-.6 1.1h-8.4a.7.7 0 0 1-.6-1.1z" fill="var(--primary)" stroke="none" />
        </g>
        {/* notebook */}
        <g className="rm-arm rm-arm-3">
          <path d="M20.5 25.4c-1.6 1-3.2 1.6-4.9 1.8" />
          <path transform="rotate(-9 12 29)" d="M8.3 24.6h6.4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8.3zM10.6 24.6v10" />
        </g>
        {/* laptop */}
        <g className="rm-arm rm-arm-4">
          <path d="M27.5 25.4c1.6 1.4 3.4 2.4 5.4 3" />
          <path d="M34.2 21.3h7.6a1 1 0 0 1 1 1v5.3h-9.6v-5.3a1 1 0 0 1 1-1zM31.6 29.4h12.8" />
        </g>
      </g>
      <Thoughts simple={size < 40} />
    </svg>
  );
}

/**
 * What's spilling out of the open head: a task card, a clock and a page,
 * lined up in a neat row (the organised, static state). When animated
 * they start scattered and tilted, jostle, then settle into that row.
 */
function Thoughts({ simple }: { simple: boolean }) {
  if (simple) {
    // Three short strokes rising out of the head - reads as "thoughts" at 30px.
    return (
      <g className="rm-thoughts">
        <path className="rm-t rm-t-1" d="M21.6 10.6l-1.2-3" />
        <path className="rm-t rm-t-2" d="M25.2 10.2V6.8" />
        <path className="rm-t rm-t-3" d="M28.8 10.6l1.4-3" />
      </g>
    );
  }
  return (
    <g className="rm-thoughts">
      {/* the trail out of the open head */}
      <path className="rm-trail" d="M22.6 12.2c-.2-1.4-.1-2.4.3-3.3M27.4 12.2c.4-1.3 1-2.3 1.9-3.1" opacity=".55" />
      {/* task card with a done tick */}
      <g className="rm-t rm-t-1">
        <rect x="18.6" y="2.6" width="6.6" height="4.3" rx=".7" fill="var(--rune-fill, none)" />
        <path d="M20 4.8l.8.8 1.5-1.7" stroke="var(--primary)" />
        <path d="M23.1 4.7h.8" />
      </g>
      {/* clock */}
      <g className="rm-t rm-t-2">
        <circle cx="28.4" cy="4.7" r="2.3" fill="var(--rune-fill, none)" />
        <path d="M28.4 3.5v1.3l.9.6" />
      </g>
      {/* page of notes */}
      <g className="rm-t rm-t-3">
        <rect x="32" y="2.5" width="4.6" height="4.5" rx=".6" fill="var(--rune-fill, none)" />
        <path d="M33.1 3.9h2.4M33.1 5h2.4M33.1 6h1.4" />
      </g>
    </g>
  );
}

export function RuneGlyph({ size = 16, className = '', title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <ellipse cx="8" cy="4.3" rx="3.1" ry="2.85" />
      <circle cx="6.9" cy="4.3" r=".55" fill="currentColor" stroke="none" />
      <circle cx="9.1" cy="4.3" r=".55" fill="currentColor" stroke="none" />
      <path d="M6.6 7.6h2.8l.3 3.6H6.3z" />
      <path d="M7.2 11.2l-.3 3.4M8.8 11.2l.3 3.4" />
      <path d="M6.6 8 4.4 7 3.4 5.4M9.4 8l2.2-1 1-1.6M6.4 9.6l-2.4.8-1.6-.2M9.6 9.6l2.4.8 1.6-.2" />
      <circle cx="12.7" cy="3.9" r="1.35" fill="var(--primary)" stroke="none" />
    </svg>
  );
}
