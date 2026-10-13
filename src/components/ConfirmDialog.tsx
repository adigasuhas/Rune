'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { AlertTriangle } from 'lucide-react';

/**
 * Promise-based confirmation, so `window.confirm()` calls scattered through
 * event handlers become:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete task?', danger: true }))) return;
 *
 * One <ConfirmProvider> near the root renders the actual dialog; the hook
 * just resolves a promise when the user picks.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<{ confirm: ConfirmFn; prompt: PromptFn } | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [promptOpts, setPromptOpts] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const promptResolver = useRef<((v: string | null) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const prompt = useCallback<PromptFn>((o) => {
    setPromptOpts(o);
    setPromptValue(o.defaultValue ?? '');
    return new Promise<string | null>((resolve) => { promptResolver.current = resolve; });
  }, []);

  useEffect(() => {
    if (promptOpts && promptInputRef.current) {
      promptInputRef.current.focus();
      promptInputRef.current.select();
    }
  }, [promptOpts]);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };
  const settlePrompt = (value: string | null) => {
    promptResolver.current?.(value);
    promptResolver.current = null;
    setPromptOpts(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}

      {promptOpts && (
        <Modal onClose={() => settlePrompt(null)} size="sm">
          <form onSubmit={(e) => { e.preventDefault(); settlePrompt(promptValue.trim() || null); }}>
            <h2 className="font-display text-base font-bold text-foreground">{promptOpts.title}</h2>
            {promptOpts.message && <p className="text-[13px] text-ink-secondary mt-1.5">{promptOpts.message}</p>}
            <input
              ref={promptInputRef}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptOpts.placeholder}
              className="mt-4 w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-foreground placeholder-ink-faint text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
            />
            <div className="flex justify-end gap-2.5 mt-5">
              <button type="button" onClick={() => settlePrompt(null)} className="px-3.5 py-2 text-[13px] font-semibold rounded-md border border-border-strong text-foreground hover:bg-surface-sunken transition-colors">Cancel</button>
              <button type="submit" className="px-3.5 py-2 text-[13px] font-semibold rounded-md bg-primary hover:bg-primary-hover text-primary-foreground transition-colors">{promptOpts.confirmLabel || 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {opts && (
        <Modal onClose={() => settle(false)} size="sm" initialFocusRef={confirmBtnRef}>
          <div>
            <div className="flex items-start gap-3">
              {opts.danger && (
                <span className="mt-0.5 shrink-0 text-danger">
                  <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-foreground">{opts.title}</h2>
                {opts.message && (
                  <p className="text-[13px] text-ink-secondary mt-1.5 leading-relaxed">{opts.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={() => settle(false)}
                className="px-3.5 py-2 text-[13px] font-semibold rounded-md border border-border-strong text-foreground hover:bg-surface-sunken transition-colors"
              >
                {opts.cancelLabel || 'Cancel'}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => settle(true)}
                className={`px-3.5 py-2 text-[13px] font-semibold rounded-md text-primary-foreground transition-colors ${
                  opts.danger ? 'bg-danger hover:bg-danger-hover' : 'bg-primary hover:bg-primary-hover'
                }`}
              >
                {opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) return async (o) => window.confirm([o.title, o.message].filter(Boolean).join('\n\n'));
  return ctx.confirm;
}

export function usePrompt(): PromptFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) return async (o) => window.prompt([o.title, o.message].filter(Boolean).join('\n\n'), o.defaultValue ?? '');
  return ctx.prompt;
}
