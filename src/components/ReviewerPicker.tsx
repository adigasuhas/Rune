'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';

interface Reviewer {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

/**
 * "Ask for review": pick the one person to send this document to. The list
 * is whoever the server says can review this notebook (team owner and the
 * team leaders on its project) - the server checks the choice again when
 * the request is sent. Searchable, keyboard-driven (↑/↓, Enter, Esc).
 */
export function ReviewerPicker({
  notebookId,
  pageId,
  onSend,
  onClose,
}: {
  notebookId: string;
  pageId: string;
  onSend: (reviewer: Reviewer) => Promise<boolean>;
  onClose: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [lostAccess, setLostAccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Reviewer | null>(null);
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${notebookId}/pages/${pageId}/review`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setReviewers(d.reviewers || []);
        setLostAccess(d.requestedFrom && !d.requestedFrom.eligible ? d.requestedFrom.name : null);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [notebookId, pageId, reload]);

  useEffect(() => {
    if (state === 'ready') inputRef.current?.focus();
  }, [state]);

  // Close on a click outside the panel.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? reviewers.filter((r) => `${r.name} ${r.email} ${r.role}`.toLowerCase().includes(q)) : reviewers;
  }, [reviewers, query]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  const send = async () => {
    if (!selected || sending) return;
    setSending(true);
    const ok = await onSend(selected);
    setSending(false);
    if (ok) onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[activeIndex] && matches[activeIndex].id !== selected?.id) setSelected(matches[activeIndex]);
      else send();
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Ask for review"
      onKeyDown={onKeyDown}
      className="absolute right-0 top-full z-30 mt-2 w-[340px] max-w-[calc(100vw-32px)] rounded-[12px] border border-border bg-surface p-3 shadow-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-foreground">Ask for review</p>
          <p className="text-[12.5px] text-ink-secondary">They’ll get a notification and can comment and sign off.</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {lostAccess && (
        <p className="mb-2 rounded-[8px] bg-warning-soft px-2.5 py-2 text-[12.5px] text-foreground">
          {lostAccess} can no longer review this notebook. Choose someone else.
        </p>
      )}

      {state === 'loading' && (
        <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading reviewers">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[9px] bg-surface-sunken" />
              <div className="h-3 flex-1 rounded bg-surface-sunken" />
            </div>
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="py-2 text-[13px] text-ink-secondary" role="alert">
          Couldn’t load your team.{' '}
          <button type="button" className="font-semibold text-foreground underline underline-offset-2" onClick={() => { setState('loading'); setReload((n) => n + 1); }}>
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && reviewers.length === 0 && (
        <p className="py-2 text-[13px] leading-relaxed text-ink-secondary">
          Nobody can review this yet. Reviewers are the team owner and team leaders on this notebook’s project.{' '}
          <Link href="/teams" className="font-medium text-foreground underline underline-offset-2">Manage your team</Link>
        </p>
      )}

      {state === 'ready' && reviewers.length > 0 && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
              aria-label="Search reviewers"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              placeholder="Search by name or email"
              className="h-9 w-full rounded-[9px] border border-border bg-surface-raised pl-8 pr-3 text-[13px] text-foreground placeholder:text-ink-faint focus:border-border-strong focus:outline-none"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Reviewers" className="mt-2 max-h-[232px] overflow-y-auto">
            {matches.length === 0 && <li className="px-2 py-3 text-[13px] text-ink-secondary">No one matches “{query}”.</li>}
            {matches.map((r, i) => {
              const isSelected = selected?.id === r.id;
              return (
                <li
                  key={r.id}
                  id={`${listId}-${r.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setSelected(r)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2 py-1.5 ${
                    isSelected ? 'bg-primary-soft' : i === activeIndex ? 'bg-surface-sunken' : ''
                  }`}
                >
                  <UserAvatar person={r} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{r.name}</span>
                    <span className="block truncate text-[12px] text-ink-secondary">{r.email} · {r.role}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
            <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!selected || sending}
              className="h-8 rounded-[8px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : selected ? `Send to ${selected.name.split(' ')[0]}` : 'Choose a reviewer'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
