import Link from 'next/link';
import { Logo } from '@/components/Logo';

// Next.js renders this for any URL that doesn't match a route. Without it,
// a mistyped or stale link (a bookmarked notebook page after it's been
// deleted, a shared link that's expired) fell through to Next's default,
// unbranded 404 with no way back into the app.
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <Logo size="sm" />
      <p className="mt-8 font-mono text-[12.5px] text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The link may be out of date, or the page may have been moved or deleted.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center px-4 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm rounded-md transition-colors"
      >
        Back to Rune
      </Link>
    </div>
  );
}
