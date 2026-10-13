'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Trash2, KeyRound } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Create / revoke personal access tokens for the Rune MCP server and chat-bot integrations. */
export function ApiTokensPanel() {
  const { toast } = useNotifications();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('90');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/user/api-tokens');
      if (res.ok) setTokens((await res.json()).tokens);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deliberately not a <form>: this panel renders inside the Settings page's own
  // <form>, and nested forms submit the outer one (or navigate) unpredictably.
  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/user/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), expiresInDays: expiry === 'never' ? null : Number(expiry) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewToken(data.token);
        setCopied(false);
        setName('');
        load();
      } else {
        toast('Couldn’t create the token', data.error || 'Try again.', 'error');
      }
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (t: TokenRow) => {
    const res = await fetch(`/api/user/api-tokens?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Token revoked', `“${t.name}” can no longer access your account.`, 'success');
      load();
    } else {
      toast('Couldn’t revoke the token', 'Try again.', 'error');
    }
  };

  const copy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      toast('Couldn’t copy', 'Select the token and copy it manually.', 'warning');
    }
  };

  return (
    <div className="p-5 border-t border-border/60 space-y-4">
      <p className="text-[11px] text-muted-foreground leading-normal">
        Access tokens let the Rune MCP server, and chat bots built on it, read and edit your tasks, schedule, and
        projects for you. A token can’t change your password, export your data, or manage other tokens. Keep it secret.
      </p>

      {newToken && (
        <div className="p-4 bg-primary-soft/40 border border-primary/40 rounded-md space-y-2" role="status">
          <span className="text-xs font-semibold text-foreground block">Copy your new token now. It won’t be shown again.</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate font-mono text-[11px] bg-surface-sunken border border-border rounded px-2.5 py-2 select-all">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border-strong rounded-md hover:bg-surface-sunken transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={() => setNewToken(null)} className="text-[11px] text-muted-foreground underline">
            I’ve saved it
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label htmlFor="api-token-name" className="text-[11.5px] font-semibold text-ink-secondary block mb-1">
            Token name
          </label>
          <input
            id="api-token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
            maxLength={80}
            placeholder="e.g. WhatsApp bot"
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-md focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="api-token-expiry" className="text-[11.5px] font-semibold text-ink-secondary block mb-1">
            Expires
          </label>
          <select
            id="api-token-expiry"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="px-3 py-2 text-xs bg-surface border border-border rounded-md focus:outline-none focus:border-primary"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={!name.trim() || creating}
          className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-md disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </div>

      <div className="border border-border rounded-md divide-y divide-border">
        {loading ? (
          <p className="p-3 text-[11px] text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground">No active tokens.</p>
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">{t.name}</span>
                  <code className="font-mono text-[10px] text-muted-foreground">{t.prefix}…</code>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Created {fmt(t.createdAt)} · {t.lastUsedAt ? `Last used ${fmt(t.lastUsedAt)}` : 'Never used'} ·{' '}
                  {t.expired ? 'Expired' : t.expiresAt ? `Expires ${fmt(t.expiresAt)}` : 'Never expires'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(t)}
                aria-label={`Revoke token ${t.name}`}
                className="shrink-0 p-2 text-ink-secondary hover:text-danger rounded-md hover:bg-surface-sunken transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
