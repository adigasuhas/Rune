import { RuneBody } from './RuneMark';

/**
 * Small comic spot illustrations of the Rune character for empty states,
 * so an empty page in the app feels like the same product as the landing
 * page's comic - the same student, same thin line, one prop that says what
 * this page is for. Decorative (aria-hidden); the copy beside it carries
 * the meaning.
 */
export type SpotKind = 'tasks' | 'projects' | 'notebook' | 'runs' | 'wall' | 'team' | 'analytics' | 'search' | 'done' | 'help';

const SW = 0.62; // ~1.25px at the default size

export function Spot({ kind, size = 132, className = '' }: { kind: SpotKind; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 72 48" width={size} height={(size * 48) / 72} fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" className={`text-foreground ${className}`} aria-hidden="true" style={{ ['--rune-fill' as string]: 'var(--surface)' }}>
      <path d="M2 46.6h68" stroke="var(--border-strong)" />
      <g transform="translate(12 4.4)">
        <RuneBody />
        <path d="M22.4 15.2c1.2.7 2.6.6 3.7-.4" />
        {ARMS[kind]}
      </g>
      {PROPS[kind]}
    </svg>
  );
}

const ACC = 'var(--primary)';

// Arms are in the character's own 48-unit space (offset by 12,4.4 above).
const ARMS: Record<SpotKind, React.ReactNode> = {
  tasks: <><path d="M19.4 22.2c-1.8 1.6-2.6 4-2.6 6.6" /><path d="M28.6 22.2c2.4.2 4.8 1.4 7.2 3.4" /></>,
  projects: <><path d="M19.4 22.2c-.6 2.6-.4 5 .4 7.4" /><path d="M28.6 22.2c2.8.6 5.4 2 7.8 4.2" /></>,
  notebook: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.6.8 5 2.4 7 4.8" /></>,
  runs: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.6-.6 5-1.8 7.2-3.6" /></>,
  wall: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.4-2 4.4-4.6 6-7.8" /></>,
  team: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.6-1.6 4.4-4 5.6-7" /><path d="M34.2 15.2l.8-1.6M34.8 15.8l1.6-.9" /></>,
  analytics: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.6.2 5.2 1 7.6 2.6" /></>,
  search: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c2.4-.8 4.4-2.2 6-4.4" /></>,
  done: <><path d="M19.4 22.2c-1.6-2.2-2.6-4.8-3-7.6" /><path d="M28.6 22.2c1.6-2.2 2.6-4.8 3-7.6" /></>,
  help: <><path d="M19.4 22.2c-.6 2.4-.9 4.8-.8 7.4" /><path d="M28.6 22.2c1-1.8 1.4-3.8 1.4-6" /></>,
};

// Props are in the spot's own 72x48 space.
const PROPS: Record<SpotKind, React.ReactNode> = {
  tasks: (
    <g>
      <path d="M45.6 26.4h12v17.6h-12z" fill="var(--surface)" />
      <path d="M48 30.4l1 1 1.8-2M48 35l1 1 1.8-2" stroke={ACC} />
      <path d="M52.6 30.6h3.2M52.6 35.2h3.2M48.4 39.8h7.2" strokeWidth={0.45} />
    </g>
  ),
  projects: (
    <g>
      <path d="M46.4 27.4h12.4v4.4H46.4zM46 31.8h13v4.6H46zM46.8 36.4h12.2v4.4H46.8z" fill="var(--surface)" />
      <path d="M47.8 29.6h3M48.2 34.1h3" stroke={ACC} strokeWidth={0.8} />
    </g>
  ),
  notebook: (
    <g>
      <path d="M44.4 30.2l13.2-1.6 1 9.4-13.2 1.6z" fill="var(--surface)" />
      <path d="M50.9 29.4l1 9.4" strokeWidth={0.45} />
      <path d="M46.2 33.2l3.4-.4M46.4 35.2l3.4-.4M53 32.4l3.6-.4" strokeWidth={0.4} />
      <path d="M53.4 34.6l3.4-.4" stroke={ACC} strokeWidth={0.5} />
    </g>
  ),
  runs: (
    <g>
      <path d="M48.6 10.6h4.8M49.4 10.6v5l-3.6 6.2a1.2 1.2 0 0 0 1 1.8h8.2a1.2 1.2 0 0 0 1-1.8l-3.6-6.2v-5" fill="var(--surface)" />
      <path d="M47.4 19.6h8.2l1.4 2.4a.8.8 0 0 1-.7 1.2h-9.6a.8.8 0 0 1-.7-1.2z" fill={ACC} stroke="none" />
      <circle cx="61.6" cy="8.4" r="3.6" /><path d="M61.6 6.4v2l1.4.9" strokeWidth={0.45} />
    </g>
  ),
  wall: (
    <g>
      <path d="M44 4.2v40" stroke="var(--border-strong)" />
      <path d="M45.6 8.2l8-1 1 8-8 1z" fill="var(--surface)" />
      <path d="M52 18l8.4.4-.4 8.4-8.4-.4z" fill={ACC} fillOpacity=".18" stroke={ACC} />
      <path d="M46.6 28.2l7.6-.8.8 7.6-7.6.8z" fill="var(--surface)" />
    </g>
  ),
  team: (
    <g transform="translate(36 8.4) scale(.78)">
      <RuneBody />
      <path d="M22.6 15.4c1 .5 2.2.5 3.2-.2" />
      <path d="M19.4 22.2c-1.4-1.8-2.2-4.2-2.4-7M28.6 22.2c.6 2.4.9 4.8.8 7.4" />
    </g>
  ),
  analytics: (
    <g>
      <path d="M46 44V24h14v20" fill="var(--surface)" />
      <path d="M49 40v-5M52.6 40v-9M56.2 40v-6" strokeWidth={1.4} />
      <path d="M52.6 40v-9" stroke={ACC} strokeWidth={1.4} />
    </g>
  ),
  search: (
    <g>
      <circle cx="51.6" cy="11.6" r="4.6" fill="var(--surface)" />
      <path d="M48.6 15.2l-2.8 3" />
      <path d="M50 10.2c.6-.8 1.4-1.2 2.4-1.2" strokeWidth={0.45} />
    </g>
  ),
  done: (
    <g>
      <path d="M50 8.6l2.4 2.4 5-5.4" stroke={ACC} strokeWidth={1} />
      <path d="M9 10l1.2-1.6M12.6 6.4l.4-1.8M60.6 14l1.6-.6" strokeWidth={0.5} />
    </g>
  ),
  help: (
    <g>
      <path d="M44.4 6.4h14a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-8.6l-3.6 3v-3h-1.8a2 2 0 0 1-2-2V8.4a2 2 0 0 1 2-2z" fill="var(--surface)" />
      <path d="M49.6 10.2c0-1.4 1-2 2-2s2 .6 2 1.8c0 1.4-2 1.4-2 2.8" strokeWidth={0.55} />
      <circle cx="51.6" cy="14.6" r=".4" fill="currentColor" stroke="none" />
    </g>
  ),
};
