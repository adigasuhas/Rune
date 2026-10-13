'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Check, Trash2, CornerDownLeft } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

export interface NotebookComment {
  id: string;
  body: string;
  anchorQuote: string | null;
  resolved: boolean;
  authorId: string;
  authorName: string;
  isMine: boolean;
  createdAt: string;
}

interface Props {
  notebookId: string;
  pageId: string;
  /** Owner or reviewer — both can comment; only these two can resolve/delete their own. */
  canComment: boolean;
  className?: string;
  /** Controlled: the text span a new comment will be anchored to (from a
   *  selection in the page). The panel renders it and calls onAnchorClear
   *  when the user removes it or posts. */
  anchorQuote?: string | null;
  onAnchorClear?: () => void;
}

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotebookCommentsPanel({
  notebookId,
  pageId,
  canComment,
  className = '',
  anchorQuote = null,
  onAnchorClear
}: Props) {
  const { toast } = useNotifications();
  const [comments, setComments] = useState<NotebookComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const base = `/api/notebooks/${notebookId}/pages/${pageId}/comments`;

  const load = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await fetch(base);
      if (res.ok) setComments(await res.json());
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [base]);

  useEffect(() => { void load(true); }, [load]);

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim(), anchorQuote })
      });
      if (!res.ok) { toast('Not posted', 'Try again.', 'error'); return; }
      setDraft('');
      onAnchorClear?.();
      await load();
    } catch { toast('Not posted', 'Check your connection and try again.', 'error'); }
    finally { setPosting(false); }
  };

  const setResolved = async (c: NotebookComment, resolved: boolean) => {
    setComments(prev => prev.map(x => (x.id === c.id ? { ...x, resolved } : x)));
    try {
      const res = await fetch(`${base}/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved })
      });
      if (!res.ok) { await load(); toast('Not saved', 'Try again.', 'error'); }
    } catch { await load(); }
  };

  const remove = async (c: NotebookComment) => {
    setComments(prev => prev.filter(x => x.id !== c.id));
    try {
      const res = await fetch(`${base}/${c.id}`, { method: 'DELETE' });
      if (!res.ok) await load();
    } catch { await load(); }
  };

  const visible = comments.filter(c => showResolved || !c.resolved);
  const resolvedCount = comments.filter(c => c.resolved).length;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-1 pb-2 shrink-0">
        <span className="text-[12.5px] font-semibold text-ink-secondary flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-ink-faint" /> Comments
          {comments.length > 0 && <span className="font-mono text-ink-faint">· {comments.filter(c => !c.resolved).length}</span>}
        </span>
        {resolvedCount > 0 && (
          <button onClick={() => setShowResolved(v => !v)} className="text-[11px] text-ink-faint hover:text-foreground font-medium">
            {showResolved ? 'Hide' : 'Show'} resolved ({resolvedCount})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          <p className="text-[12px] text-ink-faint px-1">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-[12px] text-ink-faint px-1">
            {comments.length === 0 ? 'No comments yet.' : 'No open comments.'}
          </p>
        ) : (
          visible.map(c => (
            <div key={c.id} className={`border border-border rounded-md p-2.5 text-[12px] ${c.resolved ? 'opacity-60' : ''}`}>
              {c.anchorQuote && (
                <p className="border-l-2 border-border-strong pl-2 mb-1.5 text-ink-faint italic line-clamp-2">“{c.anchorQuote}”</p>
              )}
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{c.body}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-ink-faint font-mono">{c.authorName} · {ago(c.createdAt)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setResolved(c, !c.resolved)}
                    className={`text-[10px] font-medium flex items-center gap-0.5 ${c.resolved ? 'text-ink-faint hover:text-foreground' : 'text-primary hover:text-primary-hover'}`}
                  >
                    <Check className="w-3 h-3" /> {c.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                  {c.isMine && (
                    <button onClick={() => remove(c)} className="text-ink-faint hover:text-danger" aria-label="Delete comment">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {canComment && (
        <div className="shrink-0 pt-2 border-t border-border mt-2">
          {anchorQuote && (
            <p className="text-[10px] text-ink-faint mb-1 flex items-center gap-1">
              on “{anchorQuote.slice(0, 60)}{anchorQuote.length > 60 ? '…' : ''}”
              <button onClick={() => onAnchorClear?.()} className="text-ink-faint hover:text-danger">✕</button>
            </p>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }}
            rows={2}
            placeholder="Add a comment… (⌘↵ to post)"
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:border-border-strong resize-none"
          />
          <div className="flex justify-end mt-1.5">
            <button
              onClick={post}
              disabled={posting || !draft.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary hover:bg-primary-hover text-primary-foreground text-[11px] font-semibold rounded-md disabled:opacity-50"
            >
              <CornerDownLeft className="w-3 h-3" /> Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
