'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * "On this page": built from the article's own <h2 data-toc> headings after
 * render, so it can never list a section that isn't there. The current
 * section is tracked as you scroll.
 */
export function DocsToc() {
  const pathname = usePathname();
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const heads = Array.from(document.querySelectorAll<HTMLHeadingElement>('#main h2[data-toc][id]'));
    // Reading the DOM after the page renders is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(heads.map((h) => ({ id: h.id, text: (h.firstChild?.textContent ?? h.textContent ?? '').trim() })));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -65% 0px' }
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [pathname]);

  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-[13.5px]">
      <p className="mb-3 font-medium text-foreground">On this page</p>
      <ul className="space-y-1 border-l border-border">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={active === it.id ? 'location' : undefined}
              className={`-ml-px block border-l py-1 pl-3 leading-snug transition-colors ${
                active === it.id ? 'border-primary text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'
              }`}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
