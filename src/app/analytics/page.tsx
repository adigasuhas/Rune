'use client';

import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';

const AnalyticsView = dynamic(() => import('./AnalyticsView'), {
  ssr: false,
  loading: () => <AnalyticsLoading />
});

function AnalyticsLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      <p className="text-muted-foreground text-[12.5px] font-mono animate-pulse">Loading analytics…</p>
    </div>
  );
}

class AnalyticsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Analytics Error Boundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 p-6 bg-surface border border-border rounded-md max-w-xl mx-auto my-12 text-center">
          <AlertTriangle className="w-12 h-12 text-danger animate-pulse" />
          <h2 className="text-lg font-bold text-foreground">Analytics could not be loaded.</h2>
          <p className="text-muted-foreground text-xs max-w-md font-mono leading-relaxed bg-card border border-border p-4 rounded-md overflow-auto max-h-48 text-left w-full">
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer border-0"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function Page() {
  return (
    <AnalyticsErrorBoundary>
      <Suspense fallback={<AnalyticsLoading />}>
        <AnalyticsView />
      </Suspense>
    </AnalyticsErrorBoundary>
  );
}
