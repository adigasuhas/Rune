'use client';

import { useEffect } from 'react';

// Only fires when the root layout itself throws (rare - everything inside
// {children} is already covered by error.tsx). Next.js requires this file
// to render its own <html>/<body>, so it can't lean on the app's normal
// providers or Tailwind setup - inline styles keep it legible even if the
// failure is in the styling pipeline itself.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#faf8f3',
          color: '#1f2420',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          textAlign: 'center',
          padding: '0 16px',
        }}
      >
        <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8a8f83' }}>
          Rune
        </p>
        <h1 style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ marginTop: 8, maxWidth: 360, fontSize: 14, color: '#52584f' }}>
          The app failed to load. Try again, or reload the page.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 24,
            padding: '10px 20px',
            background: '#3d5c4a',
            color: '#f7f6f1',
            fontWeight: 600,
            fontSize: 14,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
