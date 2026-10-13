'use client';

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

/**
 * Whether the notebook editor currently on screen has unsaved changes.
 * ClientLayout reads this to confirm before a nav-away (sidebar link, logo,
 * or alt+key shortcut); NotebookView is the only writer. Replaces a prior
 * `(window as any).runeNotebookIsDirty` global, which had no type safety and
 * no cleanup guarantees.
 */
interface NotebookDirtyContextValue {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  /** Runs `action` only after confirming with the user if the notebook is dirty; clears the flag on confirm. */
  confirmLeave: (action: () => void) => void;
}

const NotebookDirtyContext = createContext<NotebookDirtyContextValue | null>(null);

export function NotebookDirtyProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const confirmLeave = useCallback((action: () => void) => {
    if (isDirtyRef.current) {
      const confirmed = window.confirm('You have unsaved changes in your Notebook. Are you sure you want to leave without saving?');
      if (!confirmed) return;
      setIsDirty(false);
    }
    action();
  }, []);

  return (
    <NotebookDirtyContext.Provider value={{ isDirty, setIsDirty, confirmLeave }}>
      {children}
    </NotebookDirtyContext.Provider>
  );
}

export function useNotebookDirty(): NotebookDirtyContextValue {
  const ctx = useContext(NotebookDirtyContext);
  if (!ctx) throw new Error('useNotebookDirty must be used within a NotebookDirtyProvider');
  return ctx;
}
