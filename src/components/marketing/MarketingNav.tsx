'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL } from '@/lib/links';
import { useSession } from '@/context/SessionContext';
import { ThemeToggle } from './ThemeToggle';

/**
 * Top bar for every public page (landing, features, pricing, docs). One
 * component so links never drift between pages; the active link comes from
 * the real route. A signed-in visitor sees "Open Rune" instead of the
 * sign-in/sign-up pair.
 */
const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
];

function isActivePath(pathname: string | null, href: string): boolean {
  return !!pathname && (pathname === href || pathname.startsWith(href + '/'));
}

export function MarketingNav() {
  const pathname = usePathname();
  const { user } = useSession();
  // Keyed by the path it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-200 ${
        scrolled || open ? 'border-border bg-background/90 backdrop-blur-md' : 'border-transparent bg-background'
      }`}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <div className="mkt-container flex h-16 items-center justify-between gap-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label="Rune home">
          <Logo size="sm" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-[9px] px-3 py-2 text-[14.5px] transition-colors ${
                  active ? 'font-medium text-foreground' : 'text-ink-secondary hover:bg-surface-raised hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Rune on GitHub"
            title="Rune on GitHub"
            className="grid h-9 w-9 place-items-center rounded-[9px] text-ink-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <GithubIcon className="h-[18px] w-[18px]" />
          </a>
          <ThemeToggle />
          <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
          {user ? (
            <Link href="/" className="btn btn-primary btn-sm">Open Rune</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-[9px] px-3 py-2 text-[14.5px] font-medium text-foreground transition-colors hover:bg-surface-raised">
                Sign in
              </Link>
              <Link href="/login?mode=signup" className="btn btn-primary btn-sm ml-1">Get started</Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpenOn(open ? null : pathname)}
            className="grid h-9 w-9 place-items-center rounded-[9px] text-foreground hover:bg-surface-raised"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6.5h14M3 13.5h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-border md:hidden">
          <div className="mkt-container flex flex-col py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
                className="rounded-[9px] px-2 py-3 text-[16px] text-foreground hover:bg-surface-raised aria-[current=page]:font-semibold"
              >
                {link.label}
              </Link>
            ))}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-[9px] px-2 py-3 text-[16px] text-foreground hover:bg-surface-raised">
              <GithubIcon className="h-4 w-4" /> GitHub
            </a>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-4">
              {user ? (
                <Link href="/" className="btn btn-primary col-span-2">Open Rune</Link>
              ) : (
                <>
                  <Link href="/login" className="btn btn-secondary">Sign in</Link>
                  <Link href="/login?mode=signup" className="btn btn-primary">Get started</Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
