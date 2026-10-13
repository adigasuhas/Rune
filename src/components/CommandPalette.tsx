'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import {
  Search, LayoutDashboard, CheckSquare, FolderGit2, BookOpen, Cpu, StickyNote,
  FlaskConical, BarChart3, Building2, Settings, HelpCircle, CornerDownLeft, Plus
} from 'lucide-react';

interface SearchResults {
  tasks: { id: string; name: string; status: string }[];
  projects: { id: string; name: string; status: string }[];
  notebookPages: { id: string; title: string; notebookId: string; notebookTitle: string }[];
  runs: { id: string; name: string; status: string }[];
}

const EMPTY_RESULTS: SearchResults = { tasks: [], projects: [], notebookPages: [], runs: [] };

/**
 * Cmd/Ctrl+K global search + quick navigation + in-place actions. Combines
 * live search across the caller's own tasks/projects/notebook pages/runs
 * (GET /api/search), a small "Actions" list (e.g. "Create task" - opens the
 * Tasks page's own create modal, same-page or via a deep-link handoff if
 * elsewhere), and a static "go to" nav list, in one flat keyboard-navigable
 * list.
 */
export function CommandPalette() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const navActions = [
    { label: 'Go to Today', href: '/', icon: LayoutDashboard },
    { label: 'Go to Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Go to Projects', href: '/projects', icon: FolderGit2 },
    { label: 'Go to Notebook', href: '/notebook', icon: BookOpen },
    { label: 'Go to Runs', href: '/jobs', icon: Cpu },
    { label: 'Go to Wall', href: '/wall', icon: StickyNote },
    ...(user?.hasTeam ? [{ label: 'Go to Lab', href: '/lab', icon: FlaskConical }] : []),
    { label: 'Go to Analytics', href: '/analytics', icon: BarChart3 },
    ...(user?.hasTeam ? [{ label: 'Go to Team', href: '/teams', icon: Building2 }] : []),
    { label: 'Go to Settings', href: '/settings', icon: Settings },
    { label: 'Go to Help', href: '/help', icon: HelpCircle },
  ];

  // In-place actions, as opposed to navActions' "go look at a page" - each
  // owns how it gets there (a same-page event vs. a cross-page handoff),
  // reusing the exact deep-link pattern already used for notification/run
  // links rather than lifting Tasks' create-modal into a global provider.
  const quickActions = [
    {
      label: 'Create task',
      icon: Plus,
      go: () => {
        if (pathname === '/tasks') {
          window.dispatchEvent(new Event('rune-open-new-task'));
        } else {
          try { sessionStorage.setItem('rune-deep-link-open-new-task', 'true'); } catch { /* private mode */ }
          router.push('/tasks');
        }
      }
    }
  ];

  const filteredActions = query.trim()
    ? navActions.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()))
    : navActions;
  const filteredQuickActions = query.trim()
    ? quickActions.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()))
    : quickActions;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults(EMPTY_RESULTS);
    setActiveIndex(0);
  }, []);

  // Global Cmd/Ctrl+K to open, Escape to close. Also listens for a custom
  // event so the visible header search button can open it without lifting
  // this component's state up to ClientLayout.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Excludes Shift so Ctrl/Cmd+Shift+K stays free for the notebook's
      // own document-scoped command palette (NotebookView.tsx) - without
      // this, both bindings fired on every Shift+K chord and this one
      // always won the z-index race, silently swallowing the other.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        close();
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('rune-open-command-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('rune-open-command-palette', openHandler);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(EMPTY_RESULTS); return; }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch { /* search is a convenience, fail silently */ }
    }, 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => { setActiveIndex(0); }, [query, results]);

  type FlatItem = { key: string; label: string; sub?: string; go: () => void };
  const flatItems: FlatItem[] = [
    ...results.tasks.map((t) => ({ key: `task-${t.id}`, label: t.name, sub: `Task · ${t.status.replace('_', ' ').toLowerCase()}`, go: () => { try { sessionStorage.setItem('rune-deep-link-task-id', t.id); } catch { /* ignore */ } router.push('/tasks'); } })),
    ...results.projects.map((p) => ({ key: `project-${p.id}`, label: p.name, sub: `Project · ${p.status.toLowerCase()}`, go: () => router.push(`/projects/${p.id}`) })),
    ...results.notebookPages.map((p) => ({
      key: `page-${p.id}`,
      label: p.title,
      sub: `Notebook · ${p.notebookTitle}`,
      go: () => {
        try { sessionStorage.setItem('rune-deep-link-notebook-id', p.notebookId); } catch { /* private mode */ }
        router.push('/notebook');
      }
    })),
    ...results.runs.map((r) => ({ key: `run-${r.id}`, label: r.name, sub: `Run · ${r.status.toLowerCase()}`, go: () => router.push('/jobs') })),
    ...filteredQuickActions.map((a) => ({ key: `quick-${a.label}`, label: a.label, go: a.go })),
    ...filteredActions.map((a) => ({ key: `action-${a.href}`, label: a.label, go: () => router.push(a.href) })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = flatItems[activeIndex]; if (item) { item.go(); close(); } }
  };

  if (!open) return null;

  const searchSectionCount = results.tasks.length + results.projects.length + results.notebookPages.length + results.runs.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Search and navigate" className="w-full max-w-lg bg-card border border-border rounded-md shadow-[var(--shadow-modal)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search Rune"
            placeholder="Search tasks, projects, notebooks, and runs, or go to a page"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-ink-faint focus:outline-none"
          />
          <kbd className="font-mono text-[10px] text-ink-faint border border-border-strong rounded-[3px] px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1.5">
          {query.trim().length >= 2 && searchSectionCount === 0 && (
            <p className="px-4 py-3 text-xs text-ink-faint">No matches for &ldquo;{query.trim()}&rdquo;.</p>
          )}

          {searchSectionCount > 0 && (
            <div className="px-2 pb-1.5">
              <p className="px-2 pt-1.5 pb-1 text-[11.5px] font-semibold text-ink-faint">Results</p>
              {flatItems.slice(0, searchSectionCount).map((item, i) => (
                <ResultRow key={item.key} label={item.label} sub={item.sub} active={i === activeIndex} onClick={() => { item.go(); close(); }} onMouseEnter={() => setActiveIndex(i)} />
              ))}
            </div>
          )}

          {filteredQuickActions.length > 0 && (
            <div className="px-2 pb-1.5">
              <p className="px-2 pt-1.5 pb-1 text-[11.5px] font-semibold text-ink-faint">Actions</p>
              {filteredQuickActions.map((a, i) => {
                const flatIndex = searchSectionCount + i;
                const Icon = a.icon;
                return (
                  <ResultRow
                    key={a.label}
                    label={a.label}
                    icon={Icon}
                    active={flatIndex === activeIndex}
                    onClick={() => { a.go(); close(); }}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                  />
                );
              })}
            </div>
          )}

          <div className="px-2 pb-1.5">
            {(searchSectionCount > 0 || filteredQuickActions.length > 0) && <p className="px-2 pt-1.5 pb-1 text-[11.5px] font-semibold text-ink-faint">Go to</p>}
            {filteredActions.map((a, i) => {
              const flatIndex = searchSectionCount + filteredQuickActions.length + i;
              const Icon = a.icon;
              return (
                <ResultRow
                  key={a.href}
                  label={a.label}
                  icon={Icon}
                  active={flatIndex === activeIndex}
                  onClick={() => { router.push(a.href); close(); }}
                  onMouseEnter={() => setActiveIndex(flatIndex)}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-ink-faint font-mono">
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> open</span>
          <span>↑↓ move</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, sub, icon: Icon, active, onClick, onMouseEnter }: {
  label: string; sub?: string; icon?: React.ComponentType<{ className?: string }>; active: boolean; onClick: () => void; onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors cursor-pointer ${active ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-surface-sunken'}`}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0 text-ink-faint" />}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {sub && <span className="shrink-0 text-[10px] text-ink-faint">{sub}</span>}
    </button>
  );
}
