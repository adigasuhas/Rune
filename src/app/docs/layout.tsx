import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';

/**
 * Shared chrome for every /docs* route: the public nav and footer around a
 * three-column reading layout - page list (docsNav.ts), the article, and an
 * "On this page" outline on wide screens. Public and full-bleed (see
 * src/lib/publicRoutes.ts and src/proxy.ts).
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingNav />
      <div className="mkt-container grid flex-1 grid-cols-1 gap-x-12 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px]">
        <DocsSidebar />
        <main id="main" className="min-w-0 pb-24 pt-8 md:pt-14">{children}</main>
        <aside className="hidden xl:block">
          <div className="sticky top-24 pt-14">
            <DocsToc />
          </div>
        </aside>
      </div>
      <MarketingFooter />
    </div>
  );
}
