'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

/**
 * Frame for every signed-out account screen (sign in, sign up, recovery,
 * reset). The form column is the page; the side panel is identity only and
 * disappears below `lg` so a phone gets straight to the fields.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  aside,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <main id="main" className="flex flex-1 flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Rune home" className="rounded-md">
            <Logo size="sm" />
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] auth-enter">
            <h1 className="text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.025em]">{title}</h1>
            {subtitle && <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-secondary">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 border-t border-border pt-6 text-[14px] text-ink-secondary">{footer}</div>}
          </div>
        </div>
      </main>
      {aside && (
        <aside className="relative hidden w-[44%] max-w-[640px] shrink-0 overflow-hidden border-l border-border bg-bg-1 lg:block">
          {aside}
        </aside>
      )}
    </div>
  );
}

export function TextLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const cls = 'font-medium text-primary underline-offset-4 hover:underline';
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} className={`${cls} cursor-pointer`}>{children}</button>;
}
