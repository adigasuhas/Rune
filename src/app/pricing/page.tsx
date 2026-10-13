import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CoffeeNote } from '@/components/marketing/CoffeeNote';
import { CurrencyZero } from '@/components/marketing/CurrencyZero';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL, LICENSE_SUMMARY } from '@/lib/links';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Rune is free: every feature, for everyone, wherever you are. Use it here, or download it from GitHub and run it yourself.',
};

/**
 * /pricing. Rune has exactly one price, so there is exactly one card - no
 * invented tiers. The optional coffee sits beside it, styled so it can't be
 * mistaken for a plan. Three plain answers underneath, and that's the page.
 */
const INCLUDED = [
  'Today, Tasks and Projects',
  'The LaTeX lab notebook',
  'Runs, Wall and Analytics',
  'Teams, when you want them',
  'Source on GitHub',
  'Run it on your own server',
];

const QUESTIONS = [
  { q: 'Is it really free?', a: 'Yes. There is no paid version, no trial and no usage limit. Every account gets everything.' },
  { q: 'Can I run my own copy?', a: 'Yes. Download it from GitHub and run it on a laptop, a lab machine or a server. Your data stays there.' },
  { q: 'So what’s the catch?', a: 'There isn’t one. No ads, no tracking, nothing sold. It exists because I needed it.' },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingNav />
      <main id="main">
        <section className="mkt-container pb-10 pt-16 sm:pt-24">
          <p className="eyebrow hero-in">Pricing</p>
          <h1 className="display hero-in mt-4 text-[52px] sm:text-[76px]" style={{ animationDelay: '60ms' }}>
            Free. Completely.
          </h1>
          <p className="hero-in mt-5 max-w-[48ch] text-[18px] leading-relaxed text-ink-secondary" style={{ animationDelay: '120ms' }}>
            One price, in every currency, wherever you are. Use Rune here, or download it and run it yourself.
          </p>
        </section>

        <section className="mkt-container pb-20">
          <div className="hero-in grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]" style={{ animationDelay: '180ms' }}>
            <article className="flex flex-col rounded-[20px] border border-border-strong bg-surface p-6 shadow-[0_28px_56px_-36px_color-mix(in_srgb,var(--text)_35%,transparent)] sm:p-9">
              <div>
                <div>
                  <p className="text-[14px] font-medium text-ink-secondary">Rune, everything included</p>
                  <div className="mt-3 flex items-end gap-3">
                    <CurrencyZero className="font-serif text-[96px] font-medium leading-[0.85] tracking-[-0.03em] tnum" />
                    <p className="pb-2 text-[14px] leading-snug text-ink-secondary">per month,<br />forever</p>
                  </div>
                </div>
                <ul className="mt-8 grid gap-x-8 gap-y-3 border-t border-border pt-7 text-[15px] sm:grid-cols-2">
                  {INCLUDED.map((it) => (
                    <li key={it} className="flex items-start gap-2.5">
                      <svg viewBox="0 0 16 16" width="16" height="16" className="mt-[3px] shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-4 pt-9">
                <Link href="/login?mode=signup" className="btn btn-primary">Create a free account</Link>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="link-arrow text-[15px]">
                  <GithubIcon className="h-4 w-4" /> Download from GitHub
                </a>
                <Link href="/docs/getting-started" className="text-[14px] text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
                  Self-hosting guide
                </Link>
              </div>
            </article>
            <CoffeeNote />
          </div>

          <dl className="mt-16 grid gap-x-12 gap-y-8 border-t border-border pt-10 md:grid-cols-3">
            {QUESTIONS.map((x) => (
              <div key={x.q}>
                <dt className="text-[16px] font-semibold tracking-[-0.01em]">{x.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink-secondary">{x.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-[13px] text-ink-faint">{LICENSE_SUMMARY}</p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
