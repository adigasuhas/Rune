'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_GROUPS, DOCS_NAV, docHref } from './docsNav';

/** Page list with a filter box (press "/" to focus it). On phones it collapses into a sticky "current page" switcher. */
function NavLinks({ query, onNavigate }: { query: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const q = query.trim().toLowerCase();
  const filtered = q ? DOCS_NAV.filter((d) => `${d.title} ${d.description}`.toLowerCase().includes(q)) : DOCS_NAV;

  if (q && filtered.length === 0) {
    return <p className="px-3 py-3 text-[14px] text-ink-faint">Nothing matches “{query}”.</p>;
  }
  return (
    <>
      {DOCS_GROUPS.map((group) => {
        const items = filtered.filter((d) => d.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="mb-6">
            <p className="mb-1.5 px-3 text-[12.5px] font-semibold text-ink-faint">{group}</p>
            <ul>
              {items.map((d) => {
                const href = docHref(d.slug);
                const active = pathname === href;
                return (
                  <li key={d.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-[8px] px-3 py-[7px] text-[14.5px] transition-colors ${
                        active ? 'bg-surface-raised font-medium text-foreground shadow-[inset_2px_0_0_var(--primary)]' : 'text-ink-secondary hover:bg-surface-raised/70 hover:text-foreground'
                      }`}
                    >
                      {d.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function SearchBox({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div className="relative mb-6">
      <svg viewBox="0 0 16 16" width="15" height="15" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="search"
        aria-label="Filter docs pages"
        placeholder="Filter pages"
        className="auth-control h-9 w-full rounded-[9px] border bg-surface pl-9 pr-9 text-[14px] text-foreground placeholder:text-ink-faint focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[4px] border border-border px-1.5 font-mono text-[11px] text-ink-faint">/</kbd>
    </div>
  );
}

export function DocsSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const inputRef = useRef<HTMLInputElement>(null);
  const current = DOCS_NAV.find((d) => docHref(d.slug) === pathname);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <aside className="hidden md:block">
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto pb-10 pt-14">
          <SearchBox value={query} onChange={setQuery} inputRef={inputRef} />
          <nav aria-label="Documentation">
            <NavLinks query={query} />
          </nav>
        </div>
      </aside>

      <div className="sticky top-16 z-30 -mx-5 border-b border-border bg-background/95 px-5 backdrop-blur-md sm:-mx-8 sm:px-8 md:hidden">
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="docs-mobile-nav"
          className="flex w-full items-center justify-between py-3 text-left text-[15px]"
        >
          <span>
            <span className="text-ink-faint">Docs / </span>
            <span className="font-medium">{current?.title ?? 'Docs'}</span>
          </span>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
        </button>
        {open && (
          <nav id="docs-mobile-nav" aria-label="Documentation" className="max-h-[70dvh] overflow-y-auto pb-4">
            <SearchBox value={query} onChange={setQuery} />
            <NavLinks query={query} onNavigate={() => setOpenOn(null)} />
          </nav>
        )}
      </div>
    </>
  );
}
