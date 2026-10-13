'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, MessageSquare } from 'lucide-react';
import { parseMarkdownToHtml } from '@/lib/notebookExport';
import { NotebookCommentsPanel } from '@/components/NotebookCommentsPanel';
import { useNotifications } from '@/context/NotificationContext';

interface ReviewData {
  page: { id: string; title: string; content: string; tags: string[]; reviewStatus: string; reviewRequestedAt: string | null };
  notebookId: string;
  notebookTitle: string;
  projectName: string | null;
  projectId: string | null;
  ownerName: string;
  viewerRole: 'owner' | 'reviewer' | 'viewer';
  siblingPages: Array<{ id: string; title: string }>;
}

export default function ReviewPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = use(params);
  const { toast } = useNotifications();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetch(`/api/review/${pageId}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.ok ? r.json() : null; })
      .then(d => setData(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [pageId]);

  const html = useMemo(() => {
    if (!data) return '';
    return parseMarkdownToHtml(data.page.content, data.siblingPages as any, data.page.id);
  }, [data]);

  const captureSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 2) setPendingAnchor(sel.slice(0, 400));
  };

  const markReviewed = async () => {
    if (!data) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/notebooks/${data.notebookId}/pages/${data.page.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVIEWED' })
      });
      if (!res.ok) { toast('Not saved', 'Try again.', 'error'); return; }
      setData(d => (d ? { ...d, page: { ...d.page, reviewStatus: 'REVIEWED' } } : d));
      toast('Marked reviewed', `${data.ownerName} has been notified.`, 'success');
    } catch { toast('Not saved', 'Check your connection and try again.', 'error'); }
    finally { setMarking(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="space-y-4 text-center py-20 bg-surface rounded-md border border-border">
        <h3 className="text-lg font-bold text-foreground">Page not available</h3>
        <p className="text-muted-foreground text-sm">This notebook page doesn’t exist, or you don’t have access to it.</p>
        <Link href="/lab" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-semibold underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Lab
        </Link>
      </div>
    );
  }

  const canComment = data.viewerRole === 'owner' || data.viewerRole === 'reviewer';
  const reviewed = data.page.reviewStatus === 'REVIEWED';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 font-display text-[13px] font-semibold min-w-0">
          <Link href="/lab" className="text-ink-faint hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Lab
          </Link>
          <span className="text-ink-faint">·</span>
          {data.projectName && <><span className="text-ink-secondary">{data.projectName}</span><span className="text-ink-faint">·</span></>}
          <span className="text-ink-secondary">{data.notebookTitle}</span>
        </div>
        {data.viewerRole === 'reviewer' && (
          reviewed ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-2 py-1 border border-primary text-primary rounded-[3px]">
              <Check className="w-3.5 h-3.5" /> Reviewed
            </span>
          ) : (
            <button
              onClick={markReviewed}
              disabled={marking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-[13px] font-semibold rounded-md disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Mark reviewed
            </button>
          )
        )}
      </div>

      <div>
        <h1 className="app-title text-foreground">{data.page.title}</h1>
        <p className="font-mono text-[11px] text-ink-faint mt-1">
          {data.ownerName}
          {data.page.reviewStatus === 'READY' && ' · awaiting review'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 items-start">
        <div
          className="bg-surface border border-border rounded-md px-6 py-5 prose prose-neutral max-w-none prose-sm notebook-review-body"
          onMouseUp={canComment ? captureSelection : undefined}
        >
          <style>{`
            .notebook-review-body { font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif; font-size: 15px; line-height: 1.7; }
            .notebook-review-body h1, .notebook-review-body h2, .notebook-review-body h3, .notebook-review-body h4 { font-family: var(--font-geist), sans-serif; }
            .notebook-review-body code, .notebook-review-body pre { font-family: 'Courier New', Courier, monospace; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        <div className="bg-surface border border-border rounded-md p-3 lg:sticky lg:top-4 max-h-[80vh]">
          {canComment ? (
            <>
              <p className="text-[11px] text-ink-faint px-1 pb-2">Select text in the page to attach a comment to it.</p>
              <NotebookCommentsPanel
                notebookId={data.notebookId}
                pageId={data.page.id}
                canComment={canComment}
                anchorQuote={pendingAnchor}
                onAnchorClear={() => setPendingAnchor(null)}
                className="max-h-[70vh]"
              />
            </>
          ) : (
            <p className="text-[12px] text-ink-faint flex items-center gap-1.5 px-1">
              <MessageSquare className="w-3.5 h-3.5" /> View-only access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
