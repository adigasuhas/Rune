import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { BUY_ME_A_COFFEE_URL, GITHUB_REPO_URL } from '@/lib/links';

/** Footer for every public page: identity, the handful of links people actually use, and who made it. */
export function MarketingFooter() {
  const links: { label: string; href: string; external?: boolean }[] = [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: '/docs' },
    { label: 'GitHub', href: GITHUB_REPO_URL, external: true },
    { label: 'Report an issue', href: `${GITHUB_REPO_URL}/issues`, external: true },
    { label: 'Buy me a coffee', href: BUY_ME_A_COFFEE_URL, external: true },
  ];
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mkt-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <Logo size="sm" />
          <p className="mt-4 max-w-[34ch] text-[14.5px] leading-relaxed text-ink-secondary">
            One person, too many things, and a few extra hands.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3">
          {links.map((l) =>
            l.external ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-[14.5px] text-ink-secondary transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="text-[14.5px] text-ink-secondary transition-colors hover:text-foreground">
                {l.label}
              </Link>
            )
          )}
        </nav>
      </div>
      <div className="mkt-container flex flex-col gap-2 border-t border-border py-6 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Rune. Made by Suhas Adiga, mostly on filter coffee.</p>
        <p>Free to use · Self-hostable · Your data stays yours</p>
      </div>
    </footer>
  );
}
