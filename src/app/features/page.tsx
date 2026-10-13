'use client';

import Link from 'next/link';
import { SIGNUP } from '@/lib/links';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { FEATURE_GROUPS, FeatureIcon, type FeatureKey } from '@/components/marketing/FeatureIcons';
import { FeatureScene } from '@/components/marketing/FeatureScenes';
import {
  AnalyticsVignette,
  HeroPreview,
  NotebookVignette,
  ProjectsVignette,
  RunsVignette,
  TasksVignette,
  TeamsVignette,
  TodayVignette,
  WallVignette,
} from '@/components/marketing/FeatureVignettes';

/**
 * /features - the eight parts of Rune in three chapters: your day, your
 * work, your people. Each feature pairs a plain statement of the benefit
 * with an illustration of the actual interface, so the picture does most of
 * the explaining and the copy stays short. The Rune character appears once
 * per chapter (FeatureScenes.tsx), not beside every feature.
 */
const SECTIONS: { key: FeatureKey; name: string; headline: string; body: string; points: string[]; Visual: () => React.ReactElement }[] = [
  {
    key: 'today', name: 'Today', Visual: TodayVignette,
    headline: 'Plan the day you actually have.',
    body: 'Drag tasks onto an hourly grid, keep your deep-work windows clear, and watch a daily score move as things get done.',
    points: ['Hourly planner you drag tasks onto', 'Deep-work windows blocked out', '“Up next” and “Needs attention” at a glance'],
  },
  {
    key: 'tasks', name: 'Tasks', Visual: TasksVignette,
    headline: 'Tasks with enough context to decide.',
    body: 'Priority, effort and impact, the kind of session a task needs, and the project it belongs to, so picking what’s next takes seconds.',
    points: ['Deep work, focus or regular sessions', 'Effort and impact scoring', 'Postponement history, so nothing quietly slips'],
  },
  {
    key: 'analytics', name: 'Analytics', Visual: AnalyticsVignette,
    headline: 'See where the week actually went.',
    body: 'Deep versus shallow work, completion and postponement rates, and a heatmap that only counts the days you work.',
    points: ['Daily score breakdown', 'Deep vs. shallow work over time', 'Respects your working days'],
  },
  {
    key: 'projects', name: 'Projects', Visual: ProjectsVignette,
    headline: 'Every project, with everything attached.',
    body: 'Status, priority and a checklist of objectives that fills a progress ring, with the project’s notebooks, runs and wall one click away.',
    points: ['Objectives drive the progress ring', 'Reusable project templates', 'Linked notebooks, runs and notes'],
  },
  {
    key: 'notebook', name: 'Notebook', Visual: NotebookVignette,
    headline: 'A real lab notebook, written in LaTeX.',
    body: 'One continuous document per notebook, with proper maths, citations and cross-references, and every version kept.',
    points: ['KaTeX maths, citations and references', 'Outline, version history and PDF export', 'On-device dictation for when your hands are busy'],
  },
  {
    key: 'runs', name: 'Runs', Visual: RunsVignette,
    headline: 'Long jobs, tracked without babysitting.',
    body: 'Log compute jobs, experiments and instrument bookings. Every attempt is kept, and Rune nudges you when one needs a look.',
    points: ['Full attempt history, failures included', 'Check-in reminders', 'Instrument specs you set up once'],
  },
  {
    key: 'wall', name: 'Wall', Visual: WallVignette,
    headline: 'Somewhere for the half-formed ideas.',
    body: 'A sticky-note board on every project for open questions and loose thoughts that aren’t tasks yet, and might never be.',
    points: ['One board per project', 'Notes, not tickets'],
  },
  {
    key: 'teams', name: 'Teams', Visual: TeamsVignette,
    headline: 'Bring your lab along, if you want to.',
    body: 'Entirely optional. Shared projects, roles, task assignment and chat, plus a Lab overview for whoever runs the group.',
    points: ['Owner, team leader and member roles', 'Direct, group and whole-team chat', 'Per-project visibility'],
  },
];

/** The scene that introduces each chapter. */
const CHAPTER_SCENE: Record<string, FeatureKey> = { day: 'today', work: 'notebook', people: 'teams' };

const Check = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" className="mt-[3px] shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
);

export default function FeaturesPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingNav />
      <main id="main">
        <section className="mkt-container pb-14 pt-14 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(0,500px)] lg:gap-16">
            <div>
              <p className="eyebrow hero-in">Features</p>
              <h1 className="display hero-in mt-4 max-w-[14ch] text-[44px] sm:text-[64px] lg:text-[72px]" style={{ animationDelay: '60ms' }}>
                Everything you juggle, in one place.
              </h1>
            </div>
            <div className="hero-in" style={{ animationDelay: '160ms' }}>
              <HeroPreview />
            </div>
          </div>

          <nav aria-label="Jump to a feature" className="hero-in mt-14 grid gap-6 border-t border-border pt-6 sm:grid-cols-[1.1fr_1.4fr_0.6fr] sm:gap-8" style={{ animationDelay: '240ms' }}>
            {FEATURE_GROUPS.map((g, gi) => (
              <div key={g.id}>
                <a href={`#${g.id}`} className="text-[13px] font-medium text-ink-faint transition-colors hover:text-foreground">
                  <span className="tnum">0{gi + 1}</span>&nbsp;&nbsp;{g.label}
                </a>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {g.keys.map((k) => {
                    const sec = SECTIONS.find((x) => x.key === k)!;
                    return (
                      <li key={k}>
                        <a
                          href={`#${k}`}
                          className="group inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-[14px] text-ink-secondary transition-[color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground"
                        >
                          <FeatureIcon name={k} size={18} className="transition-colors group-hover:text-primary" /> {sec.name}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </section>

        {FEATURE_GROUPS.map((g, gi) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-16 border-t border-border">
            <div className="mkt-container">
              <header className="flex items-end justify-between gap-8 pb-2 pt-16 lg:pt-20">
                <div>
                  <p className="text-[13px] font-medium text-ink-faint tnum">0{gi + 1} / 03</p>
                  <h2 id={`${g.id}-title`} className="display mt-2 text-[40px] sm:text-[52px]">{g.label}</h2>
                  <p className="mt-2 text-[17px] text-ink-secondary">{g.blurb}</p>
                </div>
                <FeatureScene feature={CHAPTER_SCENE[g.id]} size={168} className="hidden shrink-0 sm:block" />
              </header>

              {g.keys.map((k, i) => {
                const { name, headline, body, points, Visual } = SECTIONS.find((x) => x.key === k)!;
                const flip = i % 2 === 1;
                return (
                  <article key={k} id={k} className="grid scroll-mt-20 items-center gap-8 py-10 lg:grid-cols-2 lg:gap-16 lg:py-12">
                    <div className={`reveal ${flip ? 'lg:order-2' : ''}`}>
                      <p className="flex items-center gap-2 text-[14px] font-medium text-ink-secondary">
                        <FeatureIcon name={k} size={18} className="text-primary" />
                        {name}
                      </p>
                      <h3 className="display mt-3 text-[30px] sm:text-[34px]">{headline}</h3>
                      <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-ink-secondary">{body}</p>
                      <ul className="mt-5 space-y-2">
                        {points.map((p) => (
                          <li key={p} className="flex items-start gap-3 text-[15px]"><Check />{p}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={`reveal ${flip ? 'lg:order-1' : ''}`}>
                      <Visual />
                    </div>
                  </article>
                );
              })}
              <div className="pb-6 lg:pb-10" />
            </div>
          </section>
        ))}

        <section className="border-t border-border">
          <div className="mkt-container flex flex-col items-start gap-8 py-20 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="display max-w-[16ch] text-[40px] sm:text-[50px]">Try it on your own mess.</h2>
              <p className="mt-4 text-[16px] text-ink-secondary">
                Or read the <Link href="/docs/user-guide" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">user guide</Link> first.
              </p>
            </div>
            <Link href={SIGNUP.href} className="btn btn-primary shrink-0">{SIGNUP.label}</Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
