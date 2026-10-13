'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isDeveloper?: boolean;
  hasTeam?: boolean;
  hasPassword?: boolean;
  hasRecovery?: boolean;
  isOnboarded?: boolean;
  showCreateFirstUser?: boolean;
  theme?: 'dark' | 'light' | 'system';
  timezone?: string;
  memberSince?: string | null;
}

interface LoginOptions {
  endpoint?: string;
  extra?: Record<string, unknown>;
  /** Where to go once signed in (a same-origin path). Defaults to `/`. */
  redirectTo?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  field?: string;
}

interface SessionContextType {
  user: User | null;
  loading: boolean;
  // Posts credentials to one of the auth endpoints and, on success, starts
  // the session: `/api/auth/password-login` (sign in, the default) or
  // `/api/auth/signup` (create an account; `extra` carries the display name
  // and recovery question). `field` names the input an error belongs to.
  login: (email: string, password: string, opts?: LoginOptions) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = async (email: string, password: string, { endpoint = '/api/auth/password-login', extra, redirectTo }: LoginOptions = {}): Promise<LoginResult> => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extra, email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // The login/signup endpoints return only a minimal user shape
        // (id/email/name/avatarUrl) - fetch the full profile (isOnboarded,
        // isDeveloper, hasTeam, ...) before navigating, so ClientLayout's
        // onboarding/redirect checks never run against stale/missing flags.
        await refreshSession();
        router.push(redirectTo || '/');
        return { success: true };
      }
      return { success: false, error: data.error || 'Sign-in failed. Try again.', field: data.field };
    } catch (e) {
      console.error('Login failed:', e);
      return { success: false, error: 'Couldn’t reach Rune. Check your connection and try again.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.push('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SessionContext.Provider value={{ user, loading, login, logout, refreshSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
