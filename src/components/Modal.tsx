'use client';

import React, { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal chrome. Every modal site in the app previously hand-rolled
 * its own overlay/panel with small drifts (bg-black/60 vs /80, rounded-2xl
 * vs rounded-[var(--radius-xl)], shadow-2xl vs shadow-[var(--shadow-modal)]).
 * This is the one canonical version - backdrop opacity, radius, shadow,
 * Escape-to-close, and a focus trap all live here instead of being
 * re-implemented per screen. Caller controls mounting (no `open` prop) to
 * match the existing `{show && <Modal>...}` convention used app-wide.
 */

type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-4xl'
};

interface ModalProps {
  onClose: () => void;
  size?: ModalSize;
  /** Retained for call-site compatibility; the Ledger design has no glass surface. */
  glass?: boolean;
  /** Element to focus when the modal opens (e.g. a primary field or button). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
}

function useFocusTrapAndEscape(panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Restore focus to whatever opened the modal when it closes (WCAG 2.4.3).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Deliberately no autofocus here: the header's close button is always
    // the first focusable element in DOM order, so auto-focusing "the
    // first element" would land on that instead of a form's primary field.
    // Callers that want a specific field focused on open (e.g. the name
    // field) still own that themselves, same as before this component existed.
    panel.addEventListener('keydown', handleTab);
    return () => panel.removeEventListener('keydown', handleTab);
  }, [panelRef]);
}

// The header's title names the dialog (aria-labelledby), WCAG 4.1.2.
const TitleIdContext = createContext<string | undefined>(undefined);

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const FIELDS = 'input:not([type=search]):not([type=hidden]), textarea, select';
const fieldValue = (el: Field) => (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : el.value);

/**
 * A stray backdrop click or Escape shouldn't silently throw away a
 * half-written form. Each field's value is noted shortly after opening (so
 * edit forms have filled in); on those two accidental ways out, a changed
 * field asks first. Search boxes and fields that appear later are ignored; the explicit
 * Close / Cancel buttons still close straight away.
 */
function useDiscardGuard(panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const initial = useRef<WeakMap<Field, string> | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const map = new WeakMap<Field, string>();
      panelRef.current?.querySelectorAll<Field>(FIELDS).forEach((el) => map.set(el, fieldValue(el)));
      initial.current = map;
    }, 150);
    return () => window.clearTimeout(t);
  }, [panelRef]);
  return useCallback(() => {
    const map = initial.current;
    const fields = panelRef.current ? Array.from(panelRef.current.querySelectorAll<Field>(FIELDS)) : [];
    const changed = !!map && fields.some((el) => map.has(el) && map.get(el) !== fieldValue(el));
    if (changed && !window.confirm('Discard your changes?')) return;
    onClose();
  }, [panelRef, onClose]);
}

export function Modal({ onClose, size = 'md', initialFocusRef, children, className = '' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dismiss = useDiscardGuard(panelRef, onClose);
  useFocusTrapAndEscape(panelRef, dismiss);

  useEffect(() => {
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    }
  }, [initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${SIZE_CLASS[size]} rounded-lg p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh] bg-card border border-border ${className}`}
      >
        <TitleIdContext.Provider value={titleId}>{children}</TitleIdContext.Provider>
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose, icon }: { title: string; onClose: () => void; icon?: React.ReactNode }) {
  const titleId = useContext(TitleIdContext);
  return (
    <div className="flex justify-between items-center mb-6">
      <h3 id={titleId} className="text-lg font-bold text-foreground flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="p-1 rounded-lg hover:bg-surface-raised text-muted-foreground cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-4 ${className}`}>{children}</div>;
}

function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex justify-end gap-3 mt-6 ${className}`}>{children}</div>;
}

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
