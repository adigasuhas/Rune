import Link from 'next/link';
import { QuickstartCard } from '@/components/QuickstartCard';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { LabStory } from '@/components/marketing/LabStory';
import { JuggleSection } from '@/components/marketing/JuggleSection';
import { BUY_ME_A_COFFEE_URL } from '@/lib/links';

/**
 * Logged-out view of `/` (see src/app/page.tsx) - the app's dashboard and
 * this landing page share the same route so there's one deployable.
 *
 * Reading order: what it is (hero, with the lab comic) -> what's inside
 * (everything you juggle) -> who made it and why -> run your own -> start.
 */
export function MarketingLanding() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingNav />

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="ruled pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="mkt-container relative grid grid-cols-1 items-center gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:pb-24 lg:pt-20">
            <div>
              <p className="eyebrow hero-in">One person. Too many things.</p>
              <h1 className="display hero-in mt-5 max-w-[12ch] text-[46px] min-[400px]:text-[52px] sm:text-[66px] lg:text-[60px] xl:text-[70px]" style={{ animationDelay: '60ms' }}>
                You, with a few <span className="italic text-primary">extra hands.</span>
              </h1>
              <p className="hero-in mt-7 max-w-[44ch] text-pretty text-[18px] leading-relaxed text-ink-secondary" style={{ animationDelay: '120ms' }}>
                Rune is a personal assistant for people running too many things at once: tasks, your day,
                projects, a LaTeX lab notebook and long experiments, kept in one calm place.
              </p>
              <div className="hero-in mt-9 flex flex-wrap items-center gap-x-6 gap-y-4" style={{ animationDelay: '180ms' }}>
                <Link href="/login?mode=signup" className="btn btn-primary">
                  Create a free account
                  <Arrow />
                </Link>
                <Link href="/features" className="link-arrow text-[15px]">
                  See what’s inside <Arrow />
                </Link>
              </div>
              <p className="hero-in mt-6 text-[13.5px] text-ink-faint" style={{ animationDelay: '240ms' }}>
                Free for everyone. No card, no trial clock, no premium tier.
              </p>
            </div>
            <div className="hero-in" style={{ animationDelay: '150ms' }}>
              <LabStory />
            </div>
          </div>
        </section>

        <JuggleSection />

        {/* Why it exists - a note from the person who made it, set for reading */}
        <section className="border-t border-border bg-bg-1">
          <div className="mkt-container grid grid-cols-1 gap-10 py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16 lg:py-28">
            <div className="reveal">
              <h2 className="text-[13px] font-medium text-ink-secondary">Why Rune exists</h2>
              <div className="mt-5 hidden items-center gap-3 lg:flex">
                <Founder />
              </div>
            </div>
            <figure className="reveal max-w-[38em]">
              <blockquote className="space-y-5 text-[20px] leading-[1.6] tracking-[-0.011em] text-foreground sm:text-[22px]">
                <p>
                  Rune started as a small, secret tool I built for myself. That’s where the name comes from.
                </p>
                <p className="text-foreground/80">
                  The things I needed were scattered across different apps, and the useful parts were often
                  behind a paywall. So I put them in one place. So anyone can use it.
                </p>
              </blockquote>
              <figcaption className="mt-8 flex flex-col gap-6 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-3 lg:hidden"><Founder /></span>
                <a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noopener noreferrer" className="link-arrow text-[14.5px] lg:ml-auto">
                  If it saves you an afternoon, the coffee’s on you <Arrow />
                  <span className="sr-only"> (opens buymeacoffee.com)</span>
                </a>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Run your own */}
        <section className="border-t border-border">
          <div className="mkt-container grid grid-cols-1 items-start gap-10 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-28">
            <div className="reveal">
              <h2 className="display text-[38px] sm:text-[46px]">Prefer your own server?</h2>
              <p className="mt-5 max-w-[42ch] text-[16.5px] leading-relaxed text-ink-secondary">
                Rune is a Next.js and Postgres app with nothing tied to one host. Run it on a laptop, a lab
                machine, a VPS or Docker, and your data stays where you put it.
              </p>
              <dl className="mt-8 grid max-w-[44ch] grid-cols-1 gap-4 text-[14.5px] sm:grid-cols-2">
                {[
                  ['No telemetry', 'Nothing phones home.'],
                  ['Works offline', 'Including local dictation.'],
                  ['Bring your Postgres', 'Or use the bundled one.'],
                  ['Backups built in', 'Export and restore from Settings.'],
                ].map(([t, d]) => (
                  <div key={t} className="border-l-2 border-border-strong pl-3">
                    <dt className="font-semibold">{t}</dt>
                    <dd className="text-ink-secondary">{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="reveal">
              <QuickstartCard />
              <p className="mt-4 text-[14px] text-ink-secondary">
                Full walkthrough in the <Link href="/docs/getting-started" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">getting started guide</Link>.
              </p>
            </div>
          </div>
        </section>

        {/* Last word */}
        <section className="border-t border-border">
          <div className="mkt-container flex flex-col items-start gap-8 py-20 sm:flex-row sm:items-end sm:justify-between lg:py-24">
            <h2 className="display reveal max-w-[18ch] text-[40px] sm:text-[52px]">Give your too-many-things a few extra hands.</h2>
            <Link href="/login?mode=signup" className="btn btn-primary reveal shrink-0">
              Create a free account <Arrow />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function Founder() {
  return (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-[14px] font-semibold text-primary">SA</span>
      <span className="text-[14.5px] leading-snug">
        <span className="block font-semibold">Suhas Adiga</span>
        <span className="text-ink-secondary">Made Rune, and uses it every day</span>
      </span>
    </>
  );
}

function Arrow() {
  return (
    <svg className="btn-arrow" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
