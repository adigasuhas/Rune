import Link from 'next/link';
import { docHref, getAdjacentDocs } from './docsNav';

export function DocsPager({ slug }: { slug: string }) {
  const { prev, next } = getAdjacentDocs(slug);
  if (!prev && !next) return null;
  const card = 'group flex flex-col gap-1 rounded-[12px] border border-border p-4 transition-colors hover:border-border-strong hover:bg-surface';
  return (
    <nav aria-label="Previous and next page" className="mt-16 grid max-w-[76ch] gap-3 sm:grid-cols-2">
      {prev ? (
        <Link href={docHref(prev.slug)} className={card}>
          <span className="text-[13px] text-ink-faint">← Previous</span>
          <span className="text-[15.5px] font-medium">{prev.title}</span>
        </Link>
      ) : <span className="hidden sm:block" />}
      {next && (
        <Link href={docHref(next.slug)} className={`${card} sm:items-end sm:text-right`}>
          <span className="text-[13px] text-ink-faint">Next →</span>
          <span className="text-[15.5px] font-medium">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
