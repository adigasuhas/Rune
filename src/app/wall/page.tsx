'use client';

import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';

// Mouse-driven drag interactions touch window/document directly - disabling
// SSR here avoids any server/client render mismatch, same reasoning as
// NotebookView's dynamic import.
const WallView = dynamic(() => import('./WallView').then((m) => m.WallView), {
  ssr: false,
  loading: () => <WallLoading />
});

function WallLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      <p className="text-muted-foreground text-[12.5px] font-mono animate-pulse">Loading wall…</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<WallLoading />}>
      <WallView />
    </Suspense>
  );
}
