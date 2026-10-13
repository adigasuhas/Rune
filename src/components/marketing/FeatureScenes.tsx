import type { FeatureKey } from './FeatureIcons';
import { RuneBody } from '@/components/brand/RuneMark';

/**
 * The Rune character acting out each feature on /features - placing a task
 * on the day's grid, juggling task cards, reading a chart, writing in the
 * notebook... Same person and the same fine pen line as the logo
 * (RuneBody), one prop per scene, pine for the one thing that matters.
 *
 * Drawn in the character's own 48-unit coordinates, on a wider stage so the
 * props have room. The one moving part (`.fs-float`) drifts a few units and
 * stops under prefers-reduced-motion.
 */

const P = 'var(--primary)';
const FILL = 'var(--surface, var(--background))';

/** Stage height and width in character units; each scene sets its own left edge (`minX`) so the drawing lines up with the text beside it. */
const STAGE = { y: -8, w: 72, h: 56 };

function Arms({ left, right }: { left: string; right: string }) {
  return (
    <>
      <path d={left} />
      <path d={right} />
    </>
  );
}

const SCENES: Record<FeatureKey, { label: string; minX: number; art: React.ReactNode }> = {
  today: {
    minX: 6,
    label: 'The Rune character placing a task block onto an hourly day grid, coffee in the other hand.',
    art: (
      <>
        <rect x="36" y="6" width="24" height="34" rx="2" fill={FILL} />
        <path d="M36 12.5h24M36 19h24M36 25.5h24M36 32h24" opacity=".45" />
        <path d="M39.4 3.6v4.4M56.6 3.6v4.4" />
        <rect x="38.5" y="20.2" width="19" height="4.2" rx="1" fill={P} stroke="none" opacity=".35" />
        <g className="fs-float">
          <rect x="39.5" y="13.2" width="18" height="5" rx="1.2" fill={P} stroke={P} />
        </g>
        <Arms left="M20.6 22.4c-2.6.6-4.6 2.2-6 4.6" right="M27.4 22.2c3.4-1.2 7.2-3.4 11-6.6" />
        <path d="M9.6 25.4h6v4.2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" fill={FILL} />
        <path d="M11.2 21.6c-.6.8.6 1.4 0 2.2M13.4 21.6c-.6.8.6 1.4 0 2.2" opacity=".6" />
      </>
    ),
  },
  tasks: {
    minX: -2,
    label: 'The Rune character juggling three task cards, one of them ticked off.',
    art: (
      <>
        <Arms left="M20.6 22.2c-3.2-1.8-5.2-4.6-6-8.4" right="M27.4 22.2c3.2-1.8 5.2-4.6 6-8.4" />
        <g className="fs-float">
          <g transform="rotate(-14 6 2)">
            <rect x="0" y="-1" width="12" height="7" rx="1.2" fill={FILL} />
            <path d="M2.4 2.6h7" opacity=".5" />
          </g>
        </g>
        <g transform="rotate(6 24 -2)">
          <rect x="18" y="-5.6" width="12" height="7" rx="1.2" fill={FILL} />
          <path d="M20.2 -2.2l1.4 1.4 2.6-2.8" stroke={P} />
          <path d="M25.6 -2.1h2.4" opacity=".5" />
        </g>
        <g className="fs-float" style={{ animationDelay: '-1.4s' }}>
          <g transform="rotate(12 42 2)">
            <rect x="36" y="-1" width="12" height="7" rx="1.2" fill={FILL} />
            <path d="M38.4 2.6h7" opacity=".5" />
          </g>
        </g>
      </>
    ),
  },
  analytics: {
    minX: 12,
    label: 'The Rune character studying a bar chart through a magnifying glass.',
    art: (
      <>
        <path d="M36 40h26M37 40V8" opacity=".5" />
        <rect x="40" y="28" width="4.4" height="12" fill={FILL} />
        <rect x="47" y="20" width="4.4" height="20" fill={FILL} />
        <rect x="54" y="12" width="4.4" height="28" fill={P} stroke={P} />
        <Arms left="M20.6 22.6c-2 1.4-3.2 3.4-3.6 6" right="M27.4 22.2c3.2-.6 6.2-2.2 8.9-4.7" />
        <g className="fs-float">
          <circle cx="41.6" cy="12.6" r="3.8" fill={FILL} />
          <path d="M38.9 15.4l-2.6 2.1" />
        </g>
      </>
    ),
  },
  projects: {
    minX: -8,
    label: 'The Rune character ticking off a project objective beside a nearly full progress ring.',
    art: (
      <>
        <circle cx="2" cy="16" r="9" opacity=".35" />
        <path d="M2 7a9 9 0 1 1-8.6 11.6" stroke={P} />
        <rect x="35" y="10" width="20" height="26" rx="2" fill={FILL} />
        <path d="M38.4 16.4l1.2 1.2 2.2-2.4M38.4 23.4l1.2 1.2 2.2-2.4" stroke={P} />
        <path d="M44.4 16.4h7.2M44.4 23.4h7.2M44.4 30.4h7.2" opacity=".5" />
        <rect x="38.2" y="28.8" width="3.2" height="3.2" rx=".6" opacity=".6" />
        <Arms left="M20.6 22.6c-3 .6-6 1.6-8.6 3" right="M27.4 22.2c3.6-.2 7.4 2.6 10.6 7.8" />
        <path className="fs-float" d="M37.8 31.4l1.6 1.6 3-3.2" stroke={P} />
      </>
    ),
  },
  notebook: {
    minX: 0,
    label: 'The Rune character writing in an open notebook, an equation floating up from the page.',
    art: (
      <>
        <path d="M6 30.6c5-1.4 10-1.4 15 0v-12c-5-1.4-10-1.4-15 0zM21 30.6c5-1.4 10-1.4 15 0v-12c-5-1.4-10-1.4-15 0z" fill={FILL} transform="translate(-4 2)" />
        <path d="M5 23.6h9M5 26.4h7M20.6 23.6h9M20.6 26.4h6" opacity=".45" transform="translate(-4 2)" />
        <Arms left="M20.6 22.6c-3.4 1.4-6 3.2-7.8 5.4" right="M27.4 22.4c2 1.8 2.6 3.6 1.8 5.6" />
        <path d="M29.2 28l3.4-6.4M28.9 28.6l.3-.6" />
        <g className="fs-float">
          <text x="38" y="12" fontSize="9" fontFamily="var(--font-serif), Georgia, serif" fontStyle="italic" fill="currentColor" stroke="none">∫ e<tspan fontSize="6" dy="-3">−x²</tspan></text>
        </g>
        <path d="M44 16.4c-1.4 1.2-2.8 2.2-4.2 2.8" opacity=".4" strokeDasharray="1 1.6" />
      </>
    ),
  },
  runs: {
    minX: -9,
    label: 'The Rune character with a coffee, waiting on a bubbling flask while a clock ticks.',
    art: (
      <>
        <path d="M44.4 14h5.2M45.2 14v6l-4 7.2a1.4 1.4 0 0 0 1.2 2.1h9.2a1.4 1.4 0 0 0 1.2-2.1l-4-7.2v-6" fill={FILL} />
        <path d="M42.4 24.6h9.2l2.2 3.8a.8.8 0 0 1-.7 1.2H40.9a.8.8 0 0 1-.7-1.2z" fill={P} stroke="none" />
        <path d="M38 34h20M42 29.4V34M54 29.4V34" opacity=".5" />
        <g className="fs-float"><circle cx="47" cy="9.4" r="1" /><circle cx="49.6" cy="5.4" r=".8" /></g>
        <circle cx="-2" cy="8" r="6" fill={FILL} />
        <path d="M-2 4.6V8l2.4 1.6" />
        <Arms left="M20.6 22.6c-2.8.8-4.8 2.8-5.6 5.4" right="M27.4 22.4c2.4 1.6 4 3.6 4.6 6" />
        <path d="M11.4 26.4h6v4.2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" fill={FILL} />
      </>
    ),
  },
  wall: {
    minX: 12,
    label: 'The Rune character pinning a sticky note to a board of loose ideas.',
    art: (
      <>
        <rect x="34" y="2" width="28" height="38" rx="2" fill={FILL} />
        <rect x="37.4" y="6" width="9" height="9" rx=".8" transform="rotate(-4 42 10)" fill={FILL} />
        <rect x="50" y="7" width="9" height="9" rx=".8" transform="rotate(5 54 11)" fill={FILL} />
        <rect x="38" y="25" width="9" height="9" rx=".8" transform="rotate(3 42 29)" fill={FILL} />
        <path d="M39.4 9.4h5M39.6 11.6h3.4M52 10.6h5M38.6 28h5" opacity=".45" />
        <g className="fs-float">
          <rect x="50.4" y="21.6" width="9" height="9" rx=".8" transform="rotate(-6 55 26)" fill={P} stroke={P} opacity=".85" />
          <circle cx="55" cy="22.6" r=".9" fill="currentColor" stroke="none" />
        </g>
        <Arms left="M20.6 22.6c-2.4 1.2-4 3-4.8 5.4" right="M27.4 22.2c7-2 15-.6 22.6 2.8" />
      </>
    ),
  },
  teams: {
    minX: -2,
    label: 'Two Rune characters passing a task card from one to the other.',
    art: (
      <>
        <g transform="translate(-14 0)">
          <RuneBody />
          <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
          <Arms left="M20.6 22.6c-2.4 1.2-4 3-4.8 5.4" right="M27.4 22.4c3.4.4 6.6-.2 9.6-1.8" />
        </g>
        <g transform="translate(16 2) scale(.94)">
          <RuneBody />
          <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
          <Arms left="M20.6 22.4c-3.4.2-6.6-.6-9.6-2.2" right="M27.4 22.6c2.4 1.2 4 3 4.8 5.4" />
        </g>
        <g className="fs-float">
          <rect x="19" y="14.2" width="12" height="7" rx="1.2" fill={P} stroke={P} />
          <path d="M21.4 17.8h7" stroke={FILL} />
        </g>
      </>
    ),
  },
};

export function FeatureScene({ feature, size = 210, className = '' }: { feature: FeatureKey; size?: number; className?: string }) {
  const scene = SCENES[feature];
  const height = (size * STAGE.h) / STAGE.w;
  // A fine pen line at any size, like the logo.
  const strokeWidth = (1.15 * STAGE.w) / size;
  return (
    <svg
      viewBox={`${scene.minX} ${STAGE.y} ${STAGE.w} ${STAGE.h}`}
      width={size}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`feature-scene shrink-0 text-foreground ${className}`}
      role="img"
      aria-label={scene.label}
    >
      {feature !== 'teams' && (
        <>
          <RuneBody openHead={feature === 'tasks'} />
          <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
        </>
      )}
      {scene.art}
    </svg>
  );
}
