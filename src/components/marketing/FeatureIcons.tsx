/**
 * One icon per part of Rune, drawn for this product rather than borrowed
 * from a generic set: same 24-unit grid, 1.6 stroke and round caps as the
 * Rune mark, and a single pine detail that carries the meaning (the
 * protected deep-work block, the ticked task, the running job's level...).
 */
import type { SVGProps } from 'react';

export type FeatureKey = 'today' | 'tasks' | 'projects' | 'notebook' | 'runs' | 'wall' | 'analytics' | 'teams';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
const ACC = 'var(--primary)';

const PATHS: Record<FeatureKey, React.ReactNode> = {
  // An hour grid with one block held for deep work.
  today: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9h17M8 2.8v3.4M16 2.8v3.4" />
      <rect x="6.5" y="11.5" width="7" height="3" rx="1" fill={ACC} stroke="none" />
      <path d="M10 17.5h7" />
    </>
  ),
  // A short list, top item done.
  tasks: (
    <>
      <rect x="3.5" y="4" width="5" height="5" rx="1.3" fill={ACC} stroke={ACC} />
      <path d="M4.9 6.6l1.1 1.1 1.8-2" stroke="var(--primary-foreground)" strokeWidth="1.3" />
      <path d="M11.5 6.5h9" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1.3" />
      <path d="M11.5 14h9M11.5 21h6" />
      <rect x="3.5" y="18.5" width="5" height="3" rx="1" />
    </>
  ),
  // A folder whose contents are partly done.
  projects: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M7 15.5h10" />
      <path d="M7 15.5h6" stroke={ACC} strokeWidth="2.2" />
    </>
  ),
  // A bound notebook with an equation on the page.
  notebook: (
    <>
      <rect x="5" y="3" width="14.5" height="18" rx="2" />
      <path d="M8.5 3v18" />
      <path d="M16.5 8.5h-4.5l2.3 3.5-2.3 3.5h4.5" stroke={ACC} strokeWidth="1.7" />
    </>
  ),
  // A flask with a level - a job partway through.
  runs: (
    <>
      <path d="M10 3h4M10.5 3v5.2L5.4 17.4A2.2 2.2 0 0 0 7.3 20.7h9.4a2.2 2.2 0 0 0 1.9-3.3L13.5 8.2V3" />
      <path d="M7.6 14.5h8.8l2 3.4a1.3 1.3 0 0 1-1.1 2H6.7a1.3 1.3 0 0 1-1.1-2z" fill={ACC} stroke="none" />
    </>
  ),
  // Two notes pinned at angles.
  wall: (
    <>
      <path d="M4.2 6.6l8.6-1.5 1.5 8.6-8.6 1.5z" />
      <path d="M10.7 9.6l8.8.4-.4 8.8-8.8-.4z" fill={ACC} fillOpacity="0.18" stroke={ACC} />
      <circle cx="8" cy="7.6" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  // Bars over a week, the deep-work part highlighted.
  analytics: (
    <>
      <path d="M3.5 20.5h17" />
      <rect x="5" y="12" width="3" height="6" rx="1" />
      <rect x="10.5" y="7" width="3" height="11" rx="1" fill={ACC} stroke={ACC} />
      <rect x="16" y="10" width="3" height="8" rx="1" />
    </>
  ),
  // Two of the Rune figures, side by side.
  teams: (
    <>
      <circle cx="8.5" cy="7" r="2.6" />
      <path d="M8.5 9.6v5.4M8.5 15l-2.3 5M8.5 15l2.3 5M8.5 11.6l-3.6-1.4M8.5 11.6l3.4-1.6" />
      <circle cx="16.8" cy="7.6" r="2.3" fill={ACC} stroke={ACC} />
      <path d="M16.8 10v4.8M16.8 14.8l-2 4.6M16.8 14.8l2 4.6M16.8 11.8l3.2-1.2" />
    </>
  ),
};

export function FeatureIcon({ name, size = 24, className = '' }: { name: FeatureKey; size?: number; className?: string }) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      {PATHS[name]}
    </svg>
  );
}

export const FEATURES: { key: FeatureKey; title: string; line: string }[] = [
  { key: 'today', title: 'Today', line: 'An hourly planner with deep-work windows and a daily score.' },
  { key: 'tasks', title: 'Tasks', line: 'Priority, effort, impact and session type, so choosing what’s next is quick.' },
  { key: 'projects', title: 'Projects', line: 'Objectives that fill a progress ring, with notebooks and runs attached.' },
  { key: 'notebook', title: 'Notebook', line: 'A lab notebook written in LaTeX, with history and PDF export.' },
  { key: 'runs', title: 'Runs', line: 'Compute jobs and instrument runs, every attempt kept.' },
  { key: 'wall', title: 'Wall', line: 'A sticky-note board for ideas that aren’t tasks yet.' },
  { key: 'analytics', title: 'Analytics', line: 'Where the week actually went: deep work, completion, streaks.' },
  { key: 'teams', title: 'Teams', line: 'Optional: shared projects, assignment, chat and a lab overview.' },
];

/** The same eight, grouped by what they help you juggle (landing + /features). */
export const FEATURE_GROUPS: { id: string; label: string; blurb: string; keys: FeatureKey[] }[] = [
  { id: 'day', label: 'Your day', blurb: 'What to do, when, and how it went.', keys: ['today', 'tasks', 'analytics'] },
  { id: 'work', label: 'Your work', blurb: 'The projects, and everything they produce.', keys: ['projects', 'notebook', 'runs', 'wall'] },
  { id: 'people', label: 'Your people', blurb: 'Only if you want company.', keys: ['teams'] },
];

/** The app's navigation icons: the eight feature icons plus three utility ones, same grid and stroke. */
export type NavIconName = FeatureKey | 'settings' | 'help' | 'lab';
const EXTRA: Record<'settings' | 'help' | 'lab', React.ReactNode> = {
  // Two sliders - preferences, not machinery.
  settings: (
    <>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" fill={ACC} stroke={ACC} />
      <circle cx="9" cy="16" r="2" />
    </>
  ),
  // A speech bubble with a question in it.
  help: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7l-4 3.2V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />
      <path d="M10 9.6c0-1.2.9-1.9 2-1.9s2 .7 2 1.7c0 1.4-2 1.4-2 2.8" />
      <circle cx="12" cy="14.4" r=".5" fill="currentColor" stroke="none" />
    </>
  ),
  // A microscope, for the lab overview.
  lab: (
    <>
      <path d="M9 4.5l3 1.6-3.4 6.4-3-1.6zM7.8 12.6l-1 1.8M5 20.5h14M10.5 20.5a5.5 5.5 0 0 0 7-8.4" />
      <path d="M12 9.6l2.4 1.3" stroke={ACC} />
    </>
  ),
};

export function NavIcon({ name, size = 18, className = '' }: { name: NavIconName; size?: number; className?: string }) {
  if (name === 'settings' || name === 'help' || name === 'lab') {
    return <svg {...base} width={size} height={size} className={className}>{EXTRA[name]}</svg>;
  }
  return <FeatureIcon name={name} size={size} className={className} />;
}
