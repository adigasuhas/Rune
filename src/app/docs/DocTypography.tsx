import type { ReactNode } from 'react';
import Link from 'next/link';
import { CopyButton } from './CopyButton';

/**
 * Prose building blocks shared by every docs page, so ten pages read as one
 * document. Tuned for reading rather than scanning: 16px body in near-ink
 * at a ~70-character measure, serif titles (the site's display face), and
 * neutral code so the brand colour stays reserved for links and actions.
 */

/** Stable, readable anchor ids from heading text ("Install and run" -> "install-and-run"). */
export function slugify(node: ReactNode): string | undefined {
  const text = flatten(node);
  if (!text) return undefined;
  return text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function flatten(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (node && typeof node === 'object' && 'props' in node) return flatten((node as { props: { children?: ReactNode } }).props.children);
  return '';
}

const measure = 'max-w-[70ch]';

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="display text-[40px] sm:text-[48px]">{children}</h1>;
}
export function Lead({ children }: { children: ReactNode }) {
  return <p className={`mb-12 mt-4 text-pretty text-[18.5px] leading-relaxed text-ink-secondary ${measure}`}>{children}</p>;
}
export function H2({ children, id }: { children: ReactNode; id?: string }) {
  const anchor = id ?? slugify(children);
  return (
    <h2 id={anchor} data-toc className="group mb-4 mt-14 scroll-mt-28 border-t border-border pt-10 font-serif text-[27px] font-medium leading-tight tracking-[-0.015em] first:mt-0">
      {children}
      {anchor && (
        <a href={`#${anchor}`} className="ml-2 align-middle font-sans text-[18px] text-ink-faint opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Link to this section`}>
          #
        </a>
      )}
    </h2>
  );
}
export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return <h3 id={id ?? slugify(children)} className="mb-2 mt-8 scroll-mt-28 text-[17px] font-semibold tracking-[-0.01em]">{children}</h3>;
}
export function P({ children }: { children: ReactNode }) {
  return <p className={`mb-5 text-[16px] leading-[1.75] text-foreground/85 ${measure} [&_strong]:font-semibold [&_strong]:text-foreground`}>{children}</p>;
}
export function Code({ children }: { children: ReactNode }) {
  return <code className="whitespace-nowrap rounded-[5px] border border-border bg-surface-raised px-[5px] py-[1px] font-mono text-[0.86em] text-foreground">{children}</code>;
}
export function Pre({ children, title }: { children: ReactNode; title?: string }) {
  const text = typeof children === 'string' ? children : flatten(children);
  return (
    <div className="mb-6 max-w-[76ch] overflow-hidden rounded-[12px] border border-border bg-surface-sunken">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[12.5px] text-ink-faint">{title ?? 'Terminal'}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13.5px] leading-relaxed text-foreground">{children}</pre>
    </div>
  );
}
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const cls = 'font-medium text-primary underline decoration-primary/35 underline-offset-[3px] transition-colors hover:decoration-primary';
  if (/^https?:/.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
  return <Link href={href} className={cls}>{children}</Link>;
}
export function UL({ children }: { children: ReactNode }) {
  return <ul className={`mb-6 list-disc space-y-2 pl-6 text-[16px] leading-[1.7] text-foreground/85 marker:text-ink-faint ${measure} [&_strong]:font-semibold [&_strong]:text-foreground`}>{children}</ul>;
}
export function OL({ children }: { children: ReactNode }) {
  return <ol className={`mb-6 list-decimal space-y-2 pl-6 text-[16px] leading-[1.7] text-foreground/85 marker:text-[14px] marker:font-medium marker:text-ink-faint ${measure} [&_strong]:font-semibold [&_strong]:text-foreground`}>{children}</ol>;
}
export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warning'; children: ReactNode }) {
  const warn = kind === 'warning';
  return (
    <aside className={`mb-6 max-w-[70ch] rounded-r-[10px] border-l-[3px] px-5 py-4 text-[15px] leading-relaxed ${warn ? 'border-warning bg-warning-soft' : 'border-primary bg-primary-soft/60'}`}>
      <p className={`mb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] ${warn ? 'text-warning' : 'text-primary'}`}>{warn ? 'Careful' : 'Note'}</p>
      <div className="text-foreground/90 [&_strong]:font-semibold [&_strong]:text-foreground">{children}</div>
    </aside>
  );
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-block min-w-[1.6em] rounded-[5px] border border-b-2 border-border-strong bg-surface px-1.5 py-[1px] text-center font-mono text-[12px] text-foreground">{children}</kbd>;
}
/** A real <table>, so screen readers announce it as one. */
export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="mb-6 max-w-[76ch] overflow-x-auto rounded-[12px] border border-border">
      <table className="w-full border-collapse text-left text-[14.5px]">
        <thead className="bg-surface-raised">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 text-[13px] font-semibold text-ink-secondary">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => <td key={j} className="px-4 py-2.5 align-top text-foreground/85">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ShortcutTable({ rows }: { rows: [ReactNode, string][] }) {
  return <Table head={['Action', 'Shortcut']} rows={rows.map(([shortcut, action]) => [action, shortcut])} />;
}
export function DocCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link href={href} className="group block rounded-[12px] border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <span className="flex items-center justify-between gap-3 text-[16px] font-semibold">
        {title}
        <span className="text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-foreground" aria-hidden="true">→</span>
      </span>
      <span className="mt-1.5 block text-[14.5px] leading-relaxed text-ink-secondary">{description}</span>
    </Link>
  );
}
