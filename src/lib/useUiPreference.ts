'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Small UI choices (e.g. which Analytics sections are open), saved to the
 * person's account so they survive refreshes, restarts and other devices.
 * A local copy is read first so the page never flashes the defaults, then
 * the account's copy wins once it arrives. One fetch per page load, shared
 * by every component that asks.
 */

type Prefs = Record<string, boolean | number | string>;
const STORAGE_KEY = 'rune_ui_prefs_v1';

let prefs: Prefs = {};
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readLocal(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private window: the account copy still has it */
  }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  prefs = readLocal();
  fetch('/api/settings/ui-preferences')
    .then((r) => (r.ok ? r.json() : null))
    .then((server: Prefs | null) => {
      if (!server) return;
      prefs = { ...prefs, ...server };
      writeLocal();
      emit();
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUiPreference(key: string, value: boolean | number | string) {
  prefs = { ...prefs, [key]: value };
  writeLocal();
  emit();
  fetch('/api/settings/ui-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  }).catch(() => {});
}

/** Several at once (e.g. "expand all"), in one request. */
export function setUiPreferences(values: Record<string, boolean | number | string>) {
  prefs = { ...prefs, ...values };
  writeLocal();
  emit();
  fetch('/api/settings/ui-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  }).catch(() => {});
}

export function useUiPreference<T extends boolean | number | string>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (key in prefs ? (prefs[key] as T) : fallback),
    () => fallback
  );
  const set = useCallback((v: T) => setUiPreference(key, v), [key]);
  return [value, set];
}
