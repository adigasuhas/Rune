import { RuneBody } from '@/components/brand/RuneMark';

/**
 * "Why Rune exists", drawn: the tools someone needed, scattered across
 * separate apps (two of them behind a padlock), all flowing into the one
 * notebook the Rune character holds. Same pen line as the logo; pine marks
 * the one place everything ends up.
 */
const FILL = 'var(--surface, var(--background))';

export function OriginScene({ size = 320, className = '' }: { size?: number; className?: string }) {
  const W = 92, H = 64;
  const strokeWidth = (1.15 * W) / size;
  return (
    <svg
      viewBox={`-6 -8 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-foreground ${className}`}
      role="img"
      aria-label="Drawing: tools scattered across separate apps, some locked behind a paywall, all flowing into one notebook held by the Rune character."
    >
      {/* the scattered apps, faint */}
      <g opacity=".5">
        <g transform="rotate(-6 6 4)">
          <rect x="-2" y="-2" width="16" height="11" rx="1.6" fill={FILL} />
          <path d="M1 1.4h4M1 4h10M1 6.2h7" />
        </g>
        <g transform="rotate(5 8 24)">
          <rect x="0" y="18" width="16" height="11" rx="1.6" fill={FILL} />
          <path d="M3 21.4l1.4 1.4 2.4-2.6M8.6 21.6h5M3 25.4h10" />
          {/* padlock */}
          <rect x="11.2" y="25.2" width="5.6" height="4.4" rx=".8" fill={FILL} />
          <path d="M12.4 25.2v-1.2a1.6 1.6 0 0 1 3.2 0v1.2" />
        </g>
        <g transform="rotate(-4 10 42)">
          <rect x="2" y="37" width="16" height="11" rx="1.6" fill={FILL} />
          <path d="M5 45l3-3 2.4 2 4-4.4" />
          <rect x="13.2" y="44.2" width="5.6" height="4.4" rx=".8" fill={FILL} />
          <path d="M14.4 44.2v-1.2a1.6 1.6 0 0 1 3.2 0v1.2" />
        </g>
      </g>
      {/* everything flowing to one place */}
      <path d="M17 6c8 1 12 6 16 13M19 24c6 0 10 1 14 2M21 42c6-3 9-7 12-11" strokeDasharray="1.4 2" opacity=".55" />

      {/* the person, with the one notebook */}
      <g transform="translate(34 2)">
        <RuneBody />
        <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
        <path d="M20.6 22.6c-2.6.6-4.6 2.4-5.4 5M27.4 22.6c2.4.8 4 2.6 4.6 5" />
        <rect x="11" y="26" width="26" height="15" rx="1.6" fill={FILL} />
        <path d="M24 26v15" />
        <path d="M14 30h7M14 33h6M14 36h7M27 30h7M27 33h5" opacity=".55" />
        <circle cx="33.6" cy="36.4" r="1.6" fill="var(--primary)" stroke="none" />
      </g>
    </svg>
  );
}
