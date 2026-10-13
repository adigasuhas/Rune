/**
 * Single source of truth for the docs sidebar, search index, and prev/next
 * pagers - one list instead of four places that could drift out of sync.
 */
export interface DocEntry {
  slug: string; // relative to /docs, '' for the index page
  title: string;
  description: string;
  group: string;
}

export const DOCS_NAV: DocEntry[] = [
  { slug: '', title: 'Introduction', description: 'What Rune is, why it exists, and who it is for.', group: 'Get started' },
  { slug: 'getting-started', title: 'Getting started', description: 'Install it, set it up, sign in for the first time.', group: 'Get started' },
  { slug: 'core-concepts', title: 'Core concepts', description: 'Projects, tasks, notebooks, and runs - how the pieces fit.', group: 'Get started' },
  { slug: 'features', title: 'Features', description: 'Every major part of the app, explained.', group: 'Using Rune' },
  { slug: 'user-guide', title: 'User guide', description: 'Step-by-step workflows for everyday use.', group: 'Using Rune' },
  { slug: 'timezones', title: 'Timezone configuration', description: 'How the world-map picker and UTC offsets work.', group: 'Using Rune' },
  { slug: 'faq', title: 'FAQ', description: 'Common questions, answered plainly.', group: 'Reference' },
  { slug: 'troubleshooting', title: 'Troubleshooting', description: 'Common errors, their causes, and how to report a bug.', group: 'Reference' },
  { slug: 'api', title: 'API & MCP server', description: 'Let chat bots and MCP clients read and edit your tasks.', group: 'Reference' },
  { slug: 'open-source', title: 'Source & contributing', description: 'Where the code lives, the licence, and how to help.', group: 'Reference' },
];

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : '/docs';
}

export function getAdjacentDocs(currentSlug: string): { prev: DocEntry | null; next: DocEntry | null } {
  const i = DOCS_NAV.findIndex((d) => d.slug === currentSlug);
  if (i === -1) return { prev: null, next: null };
  return { prev: DOCS_NAV[i - 1] ?? null, next: DOCS_NAV[i + 1] ?? null };
}

export const DOCS_GROUPS: string[] = Array.from(new Set(DOCS_NAV.map((d) => d.group)));
