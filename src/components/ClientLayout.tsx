'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/context/SessionContext';
import { useNotebookDirty } from '@/context/NotebookDirtyContext';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { RuneMark } from '@/components/brand/RuneMark';
import { NavIcon, type NavIconName } from '@/components/marketing/FeatureIcons';

// Sidebar icons: Rune's own set (the same drawings as the public site), wrapped
// to accept the className/strokeWidth props the nav passes to icon components.
function navIcon(name: NavIconName) {
  function Icon({ className = '' }: { className?: string; strokeWidth?: number }) {
    return <NavIcon name={name} size={18} className={className.replace(/\bw-4 h-4\b/, '')} />;
  }
  Icon.displayName = `NavIcon(${name})`;
  return Icon;
}
const NAV_ICONS = Object.fromEntries(
  (['today', 'tasks', 'projects', 'notebook', 'runs', 'wall', 'analytics', 'teams', 'settings', 'help', 'lab'] as NavIconName[]).map((n) => [n, navIcon(n)]),
) as Record<NavIconName, ReturnType<typeof navIcon>>;
import {
  LogOut,
  Menu,
  X,
  Keyboard,
  Users,
  Settings2,
  Database,
  FileText,
  User,
  RefreshCw,
  Search,
  ChevronLeft,
  Sun,
  Moon
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { ToastContainer } from '@/components/ToastContainer';
import { CommandPalette } from '@/components/CommandPalette';
import { isPublicPage } from '@/lib/publicRoutes';

/** "Ada Lovelace" -> "AL"; falls back to the email's first letter, then "U". */
function initials(name?: string | null, email?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email?.[0] || 'U').toUpperCase();
}

/**
 * useSearchParams() forces a Suspense boundary at the exact component that
 * calls it (Next's own recommended pattern - see src/app/login/page.tsx).
 * ClientLayout wraps every route including /_not-found, so calling the hook
 * directly there broke `next build`'s prerender of that page. Isolating it
 * here, behind a local Suspense with a null fallback, keeps that requirement
 * scoped to this one read instead of forcing the whole shell dynamic.
 */
function AdminTabWatcher({ onChange }: { onChange: (tab: string | null) => void }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  useEffect(() => { onChange(tab); }, [tab, onChange]);
  return null;
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, refreshSession } = useSession();
  const { confirmLeave } = useNotebookDirty();
  const router = useRouter();
  const pathname = usePathname();
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isGlobalSidebarCollapsed, setIsGlobalSidebarCollapsed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const collapsed = localStorage.getItem('rune_global_sidebar_collapsed') === 'true';
      setIsGlobalSidebarCollapsed(collapsed);
    }
  }, []);

  const toggleGlobalSidebar = () => {
    setIsGlobalSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('rune_global_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Mirrors Settings' handleThemeChange exactly (instant + persisted) so the
  // topbar's quick toggle and the Settings page control never disagree.
  const toggleTheme = async () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rune_theme_v2', next);
    setIsDark(next !== 'light');
    window.dispatchEvent(new CustomEvent('rune-theme-changed', { detail: next }));
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next })
      });
      await refreshSession();
    } catch {
      // Local toggle already applied - a failed persist just means it
      // reverts to the account's saved theme on next load.
    }
  };

  // Developer Create First User Overlay States
  const [firstUserName, setFirstUserName] = useState('');
  const [firstUserEmail, setFirstUserEmail] = useState('');
  const [firstUserPassword, setFirstUserPassword] = useState('');
  const [creatingFirstUser, setCreatingFirstUser] = useState(false);
  const [firstUserError, setFirstUserError] = useState<string | null>(null);

  const handleCreateFirstUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstUserName || !firstUserEmail || !firstUserPassword) return;
    setCreatingFirstUser(true);
    setFirstUserError(null);
    try {
      const res = await fetch('/api/developer/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: firstUserName,
          email: firstUserEmail,
          password: firstUserPassword,
          timezone: 'UTC',
          role: 'USER'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setFirstUserName('');
        setFirstUserEmail('');
        setFirstUserPassword('');
        if (refreshSession) {
          await refreshSession();
        }
      } else {
        setFirstUserError(data.error || 'Couldn’t create the user. Try again.');
      }
    } catch (err) {
      setFirstUserError('Network error. Check your connection and try again.');
    } finally {
      setCreatingFirstUser(false);
    }
  };

  const [fontSize, setFontSize] = useState('medium');

  // Load and listen to font size
  useEffect(() => {
    const size = localStorage.getItem('rune_font_size') || 'medium';
    setFontSize(size);
    document.body.setAttribute('data-font-size', size);
    document.documentElement.setAttribute('data-font-size', size);

    const handleFontSizeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setFontSize(customEvent.detail);
      document.body.setAttribute('data-font-size', customEvent.detail);
      document.documentElement.setAttribute('data-font-size', customEvent.detail);
    };
    window.addEventListener('rune-font-size-changed', handleFontSizeChange);
    return () => window.removeEventListener('rune-font-size-changed', handleFontSizeChange);
  }, []);

  // Apply the user's theme (light/dark) to the document root. Mirrors the
  // font-size pattern above: a cached value applies instantly on mount so
  // there's no flash, a live listener picks up in-session changes from
  // Settings, and a separate effect below syncs from the server value
  // (the source of truth) once the session loads.
  // A stored preference may be 'light', 'dark' or 'system' (follow the OS).
  const resolveTheme = (pref: string | null | undefined): 'light' | 'dark' =>
    pref === 'light' || pref === 'dark' ? pref : (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  useEffect(() => {
    const cached = localStorage.getItem('rune_theme_v2');
    if (cached) {
      const t = resolveTheme(cached);
      document.documentElement.setAttribute('data-theme', t);
      setIsDark(t !== 'light');
    }

    const handleThemeChange = (e: Event) => {
      const pref = (e as CustomEvent).detail as string;
      const t = resolveTheme(pref);
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('rune_theme_v2', pref);
      setIsDark(t !== 'light');
    };
    window.addEventListener('rune-theme-changed', handleThemeChange);
    return () => window.removeEventListener('rune-theme-changed', handleThemeChange);
     
  }, []);

  useEffect(() => {
    if (!user?.theme) return;
    const apply = () => {
      const t = resolveTheme(user.theme);
      document.documentElement.setAttribute('data-theme', t);
      setIsDark(t !== 'light');
    };
    apply();
    localStorage.setItem('rune_theme_v2', user.theme);
    if (user.theme !== 'system') return;
    // Following the OS: keep following it if it changes while Rune is open.
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
     
  }, [user?.theme]);

  // Redirect if not logged in or not onboarded. `/` (the marketing page when
  // signed out) and every public page (src/lib/publicRoutes.ts) are exempt.
  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/' && !isPublicPage(pathname)) {
        // Preserve where they were headed (e.g. a team invite link) through
        // login - otherwise a logged-out click on an invite link lands on
        // the dashboard after signing in, with the invite silently lost.
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      } else if (user && !user.isOnboarded && !user.isDeveloper && pathname !== '/onboarding') {
        router.push('/onboarding');
      }
    }
  }, [user, loading, pathname, router]);

  // Once per session while logged in, ping the weekly-digest endpoint. It's
  // idempotent per ISO week (dedupe key), so the first load of a new week
  // drops a "your week ahead" notification and every later load is a no-op.
  useEffect(() => {
    if (!user || loading) return;
    fetch('/api/digest/weekly').catch(() => {});
  }, [user, loading]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      // Toggle shortcuts cheatsheet with '?'
      if (e.key === '?' && !typing) {
        setShowShortcuts(prev => !prev);
      }
      // Quick navigation shortcuts
      if (e.altKey && !typing) {
        const targetKeys = ['d', 'p', 't', 'a', 'f', 's', 'j'];
        const key = e.key.toLowerCase();
        if (targetKeys.includes(key)) {
          confirmLeave(() => {
            switch (key) {
              case 'd':
                router.push('/');
                break;
              case 'p':
                router.push('/projects');
                break;
              case 't':
                router.push('/tasks');
                break;
              case 'j':
                router.push('/jobs');
                break;
              case 'a':
                router.push('/analytics');
                break;
              case 's':
                router.push('/settings');
                break;
            }
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, confirmLeave]);

  // Public pages, onboarding, and the signed-out marketing `/` are
  // full-bleed - no sidebar/header chrome.
  if (isPublicPage(pathname) || pathname === '/onboarding' || (pathname === '/' && !loading && !user)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-light animate-pulse">Loading</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecting
  }

  // Developer Create First User Overlay
  if (user.isDeveloper && user.showCreateFirstUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground overflow-hidden px-4">
        {/* Glow Effects */}
        
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-foreground/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-card border border-border rounded-md p-8 shadow-[var(--shadow-modal)]">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-lg bg-primary-soft border border-primary/20 text-primary flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Create the first user</h2>
            <p className="text-muted-foreground text-xs mt-1 max-w-xs mx-auto">
              No user accounts exist yet. Create the first one to start using Rune.
            </p>
          </div>

          {firstUserError && (
            <div className="mb-4 p-3 rounded-md bg-danger-soft border border-danger/20 text-danger text-xs">
              {firstUserError}
            </div>
          )}

          <form onSubmit={handleCreateFirstUser} className="space-y-4">
            <div>
              <label htmlFor="clientlayout-full-name" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">
                Full name
              </label>
              <input id="clientlayout-full-name"
                type="text"
                required
                value={firstUserName}
                onChange={(e) => setFirstUserName(e.target.value)}
                autoComplete="name"
                className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div>
              <label htmlFor="clientlayout-email-address" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">
                Email address
              </label>
              <input id="clientlayout-email-address"
                type="email"
                required
                value={firstUserEmail}
                onChange={(e) => setFirstUserEmail(e.target.value)}
                placeholder="you@university.edu"
                className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div>
              <label htmlFor="clientlayout-password" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">
                Password
              </label>
              <input id="clientlayout-password"
                type="password"
                required
                value={firstUserPassword}
                onChange={(e) => setFirstUserPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <button
              type="submit"
              disabled={creatingFirstUser}
              className="flex items-center justify-center w-full px-4 py-3 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm rounded-md transition-colors duration-[var(--duration-standard)] cursor-pointer disabled:opacity-50 mt-6"
            >
              {creatingFirstUser ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                'Create user'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navGroups: { label: string | null; items: { name: string; href: string; icon: any }[] }[] = [
    {
      label: 'Plan',
      items: [
        { name: 'Today', href: '/', icon: NAV_ICONS.today },
        { name: 'Tasks', href: '/tasks', icon: NAV_ICONS.tasks },
      ],
    },
    {
      label: 'Work',
      items: [
        { name: 'Projects', href: '/projects', icon: NAV_ICONS.projects },
        { name: 'Notebook', href: '/notebook', icon: NAV_ICONS.notebook },
        { name: 'Runs', href: '/jobs', icon: NAV_ICONS.runs },
        { name: 'Wall', href: '/wall', icon: NAV_ICONS.wall },
      ],
    },
    {
      label: 'Review',
      items: [
        ...(user?.hasTeam ? [{ name: 'Lab', href: '/lab', icon: NAV_ICONS.lab }] : []),
        { name: 'Analytics', href: '/analytics', icon: NAV_ICONS.analytics },
      ],
    },
    {
      label: null,
      items: [
        { name: 'Team', href: '/teams', icon: NAV_ICONS.teams },
        { name: 'Settings', href: '/settings', icon: NAV_ICONS.settings },
        { name: 'Help', href: '/help', icon: NAV_ICONS.help },
      ],
    },
  ];

  if (user?.isDeveloper) {
    navGroups.push({
      label: 'Admin',
      items: [
        { name: 'User management', href: '/developer?tab=users', icon: Users },
        { name: 'System settings', href: '/developer?tab=settings', icon: Settings2 },
        { name: 'Database', href: '/developer?tab=database', icon: Database },
        { name: 'Logs', href: '/developer?tab=logs', icon: FileText },
      ],
    });
  }

  // Topbar page title (mockup's `.topbar-title`). Matches the sidebar's own
  // isActive logic below: a query-string item (the Admin tabs, which all
  // share the /developer path) must also match the current ?tab= value, or
  // /developer?tab=users would win the title for every admin tab.
  const flatNavItems = navGroups.flatMap((g) => g.items);

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-surface-sunken text-ink-faint hover:text-foreground transition-colors cursor-pointer"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
    >
      {isDark ? <Sun className="w-4 h-4" strokeWidth={1.7} /> : <Moon className="w-4 h-4" strokeWidth={1.7} />}
    </button>
  );

  // Desktop: the shell is exactly one screen tall - the sidebar and the
  // content pane each scroll on their own (nothing here relies on window
  // scroll). Mobile keeps normal page scroll.
  return (
    <div className="flex min-h-screen md:h-dvh md:min-h-0 md:overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30 selection:text-primary-foreground">
      <Suspense fallback={null}>
        <AdminTabWatcher onChange={setCurrentTab} />
      </Suspense>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col bg-bg-1 transition-[width] duration-[var(--duration-standard)] ease-in-out md:translate-x-0 md:static overflow-hidden md:overflow-visible
        ${isGlobalSidebarCollapsed ? 'md:w-[70px] w-64 border-r border-border' : 'w-64 border-r border-border'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Wordmark */}
        <div className={`flex items-center justify-between h-14 shrink-0 ${isGlobalSidebarCollapsed ? 'md:justify-center md:px-0 px-5' : 'px-5'}`}>
          <Link
            href="/"
            className="flex items-center group"
            onClick={(e) => {
              e.preventDefault();
              const href = '/';
              confirmLeave(() => router.push(href));
            }}
          >
            {isGlobalSidebarCollapsed ? (
              <span className="hidden md:flex text-foreground"><RuneMark size={30} title="Rune" /></span>
            ) : null}
            <span className={isGlobalSidebarCollapsed ? 'md:hidden' : ''}>
              <Logo size="sm" />
            </span>
          </Link>
          {/* Mobile: closes the overlay sidebar. Desktop: collapses to the icon rail. */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md hover:bg-surface-sunken text-muted-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="w-4.5 h-4.5" />
          </button>
          {!isGlobalSidebarCollapsed && (
            <div className="hidden md:flex items-center gap-0.5">
              {themeButton}
              <NotificationBell align="left" />
              <button
                onClick={toggleGlobalSidebar}
                className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-surface-sunken text-ink-faint hover:text-foreground"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('rune-open-command-palette'))}
          className={`flex items-center gap-2 mx-3 mb-3 shrink-0 rounded-md bg-surface-sunken border border-border text-ink-faint hover:text-ink-secondary hover:border-border-strong transition-colors cursor-pointer ${isGlobalSidebarCollapsed ? 'md:justify-center md:px-0 md:mx-auto md:w-9 h-9 px-2.5' : 'px-2.5 h-9'}`}
          title="Search (Cmd/Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          {!isGlobalSidebarCollapsed && (
            <>
              <span className="text-[12px]">Search</span>
              <kbd className="ml-auto font-mono text-[9px] border border-border-strong rounded-[3px] px-1 py-0.5">⌘K</kbd>
            </>
          )}
        </button>

        {/* Collapsed-only expand affordance */}
        {isGlobalSidebarCollapsed && (
          <div className="hidden md:flex flex-col items-center gap-1 mb-1">
            {themeButton}
            <NotificationBell align="left" />
          </div>
        )}
        {isGlobalSidebarCollapsed && (
          <button
            onClick={toggleGlobalSidebar}
            className="hidden md:flex items-center justify-center mx-auto mb-2 w-9 h-9 rounded-md hover:bg-surface-sunken text-ink-faint hover:text-foreground transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              {group.label && (
                <div className={`px-2 mb-1 text-[12px] font-medium text-ink-faint whitespace-nowrap ${isGlobalSidebarCollapsed ? 'md:hidden' : ''}`}>
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const [itemPath, itemQuery] = item.href.split('?');
                  // Admin items all share the /developer path and differ only
                  // by ?tab= - a plain prefix match would light up all four at
                  // once, so items with a query string also require it to
                  // match the current URL's tab param exactly.
                  const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null;
                  const isActive = item.href === '/'
                    ? pathname === '/'
                    : (pathname?.startsWith(itemPath) ?? false) && (itemTab === null || itemTab === currentTab);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`
                        group flex items-center text-[14px] rounded-[8px] transition-[background-color,color] duration-[var(--duration-micro)]
                        px-2 py-[6px]
                        ${isGlobalSidebarCollapsed ? 'md:justify-center md:px-2' : ''}
                        ${isActive
                          ? 'bg-surface text-foreground font-semibold shadow-[0_0_0_1px_var(--border-c)]'
                          : 'text-ink-secondary hover:text-foreground hover:bg-surface-sunken font-medium'}
                      `}
                      onClick={(e) => {
                        e.preventDefault();
                        confirmLeave(() => {
                          router.push(item.href);
                          setSidebarOpen(false);
                        });
                      }}
                      title={isGlobalSidebarCollapsed ? item.name : undefined}
                    >
                      <Icon className={`shrink-0 mr-2.5 ${isGlobalSidebarCollapsed ? 'md:mr-0' : ''} ${isActive ? 'text-foreground' : 'text-ink-faint group-hover:text-ink-secondary'}`} />
                      <span className={isGlobalSidebarCollapsed ? 'md:hidden' : ''}>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Quick focus launch & Keyboard shortcuts */}
        <div className={`p-3 border-t border-border shrink-0 ${isGlobalSidebarCollapsed ? 'md:hidden' : ''}`}>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center justify-center w-full py-1 text-[11px] text-muted-foreground hover:text-ink-secondary transition-colors"
          >
            <Keyboard className="w-3 h-3 mr-1.5" />
            Keyboard shortcuts (?)
          </button>
        </div>

        {/* User Details */}
        <div className={`flex p-3 border-t border-border bg-surface shrink-0 ${isGlobalSidebarCollapsed ? 'md:flex-col md:items-center md:gap-2' : 'items-center justify-between gap-2.5'}`}>
          <div className={`flex items-center gap-2.5 overflow-hidden ${isGlobalSidebarCollapsed ? 'md:contents' : ''}`}>
            {user.avatarUrl && !user.avatarUrl.includes('dicebear.com') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name || 'User'}
                className="w-[30px] h-[30px] rounded-lg border border-border shrink-0 object-cover"
              />
            ) : (
              <div className="w-[30px] h-[30px] rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-[12px] shrink-0">
                {initials(user.name, user.email)}
              </div>
            )}
            <div className={`flex-1 min-w-0 ${isGlobalSidebarCollapsed ? 'md:hidden' : ''}`}>
              <p className="text-[12.5px] font-semibold truncate text-foreground">{user.name || 'Developer'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 text-muted-foreground hover:text-danger rounded-lg hover:bg-danger-soft transition-colors shrink-0"
            title="Sign out" aria-label="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Phones only: menu, mark, and the two utilities. Never a page
            title - every page renders its own (PageHeader), once. */}
        <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-surface-sunken text-muted-foreground"
              aria-label="Open menu"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1">
            {themeButton}
            <NotificationBell />
          </div>
        </header>

        {/* Content body */}
        <main className={`flex-1 overflow-y-auto px-5 py-6 md:px-10 md:py-9 w-full mx-auto ${pathname?.startsWith('/notebook') ? 'max-w-[95%] lg:max-w-[1700px]' : 'max-w-7xl'}`}>
          {children}
        </main>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-foreground flex items-center">
                <Keyboard className="w-5 h-5 mr-2 text-muted-foreground" /> Keyboard shortcuts
              </h3>
              <button
                onClick={() => setShowShortcuts(false)}
                aria-label="Close"
                className="p-1 rounded-lg hover:bg-surface-raised text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Show or hide shortcuts</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">?</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Go to Today</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + D</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Go to Projects</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + P</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Go to Tasks</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + T</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Go to Runs</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + J</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Go to Analytics</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + A</kbd>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Go to Settings</span>
                <kbd className="px-2 py-1 bg-surface-sunken border border-border-strong rounded text-xs text-foreground">Alt + S</kbd>
              </div>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-6 w-full py-2 bg-surface-raised hover:bg-surface-sunken border border-border text-foreground rounded-md text-sm font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ToastContainer />
      <CommandPalette />
    </div>
  );
}
