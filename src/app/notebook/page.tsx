'use client';

import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';

const NotebookView = dynamic(() => import('./NotebookView'), {
  ssr: false,
  loading: () => <NotebookLoading />
});

function NotebookLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      <p className="text-ink-faint text-[12.5px] font-mono animate-pulse">Loading notebook…</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<NotebookLoading />}>
      <NotebookView />
    </Suspense>
  );
}
