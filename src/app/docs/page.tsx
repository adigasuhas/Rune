import { QuickstartCard } from '@/components/QuickstartCard';
import { H1, Lead, H2, P, UL, DocCard, DocLink } from './DocTypography';
import { DocsPager } from './DocsPager';
import { DOCS_NAV, docHref } from './docsNav';

export const metadata = { title: 'Docs - Rune' };

export default function DocsIntroPage() {
  return (
    <div>
      <H1>Introduction</H1>
      <Lead>
        Rune is a calm, free workspace for researchers, students, and anyone juggling several projects at once: tasks, projects, a
        scheduling calendar, a LaTeX research notebook, analytics, a run and experiment tracker, a freeform notes
        board, and an optional Team and Lab mode with chat - all in one Next.js app you run yourself.
      </Lead>

      <H2>Why it exists</H2>
      <P>
        Most task managers are built for offices, not research days. Rune is built around a 13-hour day that
        includes deep work blocks, compute jobs that run for hours, a notebook that needs real math and citations,
        and a schedule that gets postponed more than it gets kept - and tracks that honestly instead of pretending
        it didn&rsquo;t happen.
      </P>
      <P>
        It is also built to stay free. There is no tier that unlocks &ldquo;real&rdquo; functionality, no per-seat
        pricing, and no account you have to trust with your data - see <DocLink href="/pricing">Why it&rsquo;s free</DocLink> for
        the reasoning.
      </P>

      <H2>Who it&rsquo;s for</H2>
      <UL>
        <li>PhD students and postdocs juggling tasks, a thesis notebook, and compute jobs at once.</li>
        <li>Research groups who want a shared Team/Lab view without adopting a heavyweight project-management tool.</li>
        <li>Anyone who wants their planning data on infrastructure they control, not a third party&rsquo;s servers.</li>
      </UL>

      <H2>Quickstart</H2>
      <P>
        Clone the repository and run the setup tool - it asks where Rune will run and writes the configuration for
        it, then can create the database tables and your first administrator account. See{' '}
        <DocLink href={docHref('getting-started')}>Getting started</DocLink> for the full walkthrough.
      </P>
      <QuickstartCard className="max-w-xl mb-10" />

      <H2>Core ideas</H2>
      <P>
        A <strong className="text-foreground">project</strong> groups related tasks and can hold one or more{' '}
        <strong className="text-foreground">notebooks</strong> - each a single continuous LaTeX document, not a
        folder of pages. A <strong className="text-foreground">run</strong> tracks a compute job or lab instrument
        session and can be referenced directly from the notebook that writes it up. See{' '}
        <DocLink href={docHref('core-concepts')}>Core concepts</DocLink> for the full vocabulary.
      </P>

      <H2>Where to go next</H2>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {DOCS_NAV.filter((d) => ['getting-started', 'core-concepts', 'user-guide', 'faq'].includes(d.slug)).map((d) => (
          <DocCard key={d.slug} title={d.title} description={d.description} href={docHref(d.slug)} />
        ))}
      </div>

      <DocsPager slug="" />
    </div>
  );
}
