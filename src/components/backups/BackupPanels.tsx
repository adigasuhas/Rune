'use client';

import React from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { Archive, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * Backups UI: the account policy (Settings → Backups), a project's schedule
 * (the project page), and the list of finished .zip files both share.
 * Changes save as they're made; there is no separate Save step.
 */

type Frequency = 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface BackupRow {
  id: string;
  projectId: string | null;
  trigger: string;
  fileName: string;
  sizeBytes: number;
  contents: { notebooks?: number; tasks?: number; attachments?: number; fullCopy?: boolean; skippedAttachments?: number };
  createdAt: string;
}

interface Policy {
  frequency: Frequency;
  notebooks: boolean;
  tasks: boolean;
  fullCopy: boolean;
  keep: number;
  email: boolean;
  lastBackupAt: string | null;
}

const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: 'OFF', label: 'Off' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];
const KEEP_CHOICES = [3, 5, 7, 14, 30];

/** The restorable copy inside a backup .zip, or a .json file's text; null if a .zip has none. */
export async function readBackupFile(file: File): Promise<string | null> {
  if (!/\.zip$/i.test(file.name) && file.type !== 'application/zip') return file.text();
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /(^|\/)rune-backup\.json$/.test(f.name) });
  const first = Object.values(entries)[0];
  return first ? strFromU8(first) : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 104857.6) / 10} MB`;
}

function describe(c: BackupRow['contents']): string {
  const parts: string[] = [];
  if (c.notebooks) parts.push(`${c.notebooks} notebook${c.notebooks === 1 ? '' : 's'}`);
  if (c.tasks) parts.push(`${c.tasks} task${c.tasks === 1 ? '' : 's'}`);
  if (c.attachments) parts.push(`${c.attachments} file${c.attachments === 1 ? '' : 's'}`);
  if (c.fullCopy) parts.push('restorable copy');
  return parts.join(' · ') || 'Empty';
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function scheduleNote(frequency: Frequency): string {
  if (frequency === 'OFF') return 'No automatic backups. You can still make one now.';
  const period = frequency === 'DAILY' ? 'day' : frequency === 'WEEKLY' ? 'week (from Monday)' : 'month';
  return `One backup each ${period}, made early in the morning, or when you next open Rune if it was missed.`;
}

/** Off / Daily / Weekly / Monthly as one segmented choice. */
function FrequencyPicker({ value, onChange, label, disabled }: { value: Frequency; onChange: (f: Frequency) => void; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-surface-sunken p-0.5">
      {FREQUENCIES.map((f) => (
        <button
          key={f.value}
          type="button"
          role="radio"
          aria-checked={value === f.value}
          disabled={disabled}
          onClick={() => onChange(f.value)}
          className={`h-8 rounded-[8px] px-3 text-[13px] transition-colors disabled:opacity-50 ${
            value === f.value ? 'bg-surface font-medium text-foreground shadow-[0_0_0_1px_var(--color-border)]' : 'text-ink-secondary hover:text-foreground'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function BackupList({ backups, onDelete, compact }: { backups: BackupRow[]; onDelete: (b: BackupRow) => void; compact?: boolean }) {
  if (backups.length === 0) {
    return <p className="text-[13px] text-ink-faint">No backups yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {backups.map((b) => (
        <li key={b.id} className={`group flex items-center gap-3 ${compact ? 'py-2' : 'py-2.5'}`}>
          <Archive className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-foreground">
              {when(b.createdAt)}
              <span className="ml-2 text-[11.5px] text-ink-faint">{b.trigger === 'SCHEDULED' ? 'scheduled' : 'made by hand'}</span>
            </p>
            <p className="truncate text-[12px] text-ink-faint tabular-nums" title={b.fileName}>
              {compact ? formatBytes(b.sizeBytes) : `${describe(b.contents)} · ${formatBytes(b.sizeBytes)}`}
            </p>
          </div>
          <a
            href={`/api/backups/${b.id}`}
            download={b.fileName}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium text-primary hover:bg-primary-soft transition-colors"
            aria-label={`Download the backup from ${when(b.createdAt)}`}
          >
            <Download className="h-3.5 w-3.5" />
            {!compact && 'Download'}
          </a>
          <button
            type="button"
            onClick={() => onDelete(b)}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-danger-soft hover:text-danger transition-colors"
            aria-label={`Delete the backup from ${when(b.createdAt)}`}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Shared loading, "back up now" and delete for a scope (account, or one project). */
function useBackups(projectId?: string) {
  const confirm = useConfirm();
  const [backups, setBackups] = React.useState<BackupRow[]>([]);
  const [extra, setExtra] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  const load = React.useCallback(
    () =>
      fetch(`/api/backups${query}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Couldn’t load backups.');
          setBackups(data.backups);
          setExtra(data);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load backups.'))
        .finally(() => setLoading(false)),
    [query]
  );

  React.useEffect(() => { load(); }, [load]);

  const backUpNow = async () => {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectId ? { projectId } : {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The backup couldn’t be made.');
      setNotice(data.emailed ? 'Backup made and emailed to you.' : 'Backup made. Download it below.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The backup couldn’t be made.');
    } finally {
      setWorking(false);
    }
  };

  const remove = async (b: BackupRow) => {
    if (!(await confirm({ title: 'Delete this backup?', message: `The .zip from ${when(b.createdAt)} will be gone for good.`, confirmLabel: 'Delete backup', danger: true }))) return;
    const res = await fetch(`/api/backups/${b.id}`, { method: 'DELETE' });
    if (res.ok) setBackups((list) => list.filter((x) => x.id !== b.id));
    else setError('Couldn’t delete that backup.');
  };

  return { backups, extra, setExtra, loading, working, error, setError, notice, backUpNow, remove };
}

/** Settings → Backups: what an account backup holds, how often, how many to keep. */
export function AccountBackupSettings() {
  const { backups, extra, setExtra, loading, working, error, setError, notice, backUpNow, remove } = useBackups();
  const policy = extra?.policy as Policy | undefined;
  const emailAvailable = Boolean(extra?.emailAvailable);
  const [saved, setSaved] = React.useState(false);

  const save = async (change: Partial<Policy>) => {
    if (!policy) return;
    const next = { ...policy, ...change };
    setExtra((e) => ({ ...(e ?? {}), policy: next }));
    setSaved(false);
    const { lastBackupAt: _ignored, ...body } = change as Policy;
    void _ignored;
    const res = await fetch('/api/backups/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } else {
      setExtra((e) => ({ ...(e ?? {}), policy }));
      setError('Couldn’t save that change. Try again.');
    }
  };

  const nothingIncluded = policy && !policy.notebooks && !policy.tasks && !policy.fullCopy;

  return (
    <section aria-labelledby="auto-backups-title" className="p-4 bg-surface-sunken/40 border border-border rounded-md space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 id="auto-backups-title" className="text-[13.5px] font-semibold text-foreground">Automatic backups</h3>
          <p className="text-[12.5px] text-muted-foreground leading-normal max-w-xl">
            A .zip of your notebooks and tasks, made on a schedule and kept here to download. Projects can have their own schedule, set on each project’s page.
          </p>
        </div>
        <button
          type="button"
          onClick={backUpNow}
          disabled={working || !policy || !!nothingIncluded}
          className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-[13.5px] font-bold rounded-[9px] transition-colors inline-flex items-center gap-1.5"
        >
          {working ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Backing up…</> : 'Back up now'}
        </button>
      </div>

      {loading || !policy ? (
        <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-muted-foreground">How often</p>
            <FrequencyPicker value={policy.frequency} onChange={(frequency) => save({ frequency })} label="How often to back up your account" />
            <p className="text-[12px] text-ink-faint leading-relaxed">{scheduleNote(policy.frequency)}</p>
            {policy.lastBackupAt && <p className="text-[12px] text-ink-faint">Last backup {when(policy.lastBackupAt)}.</p>}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[11.5px] font-semibold text-muted-foreground mb-2">What goes in</legend>
            {([
              ['notebooks', 'Notebooks', 'LaTeX source (.tex) and a readable copy (.html) of each, with attached files.'],
              ['tasks', 'Tasks', 'Every task with its schedule, as a spreadsheet (.csv) and in full (.json).'],
              ['fullCopy', 'Restorable copy', 'Your whole workspace as rune-backup.json, so the .zip can be restored here.'],
            ] as const).map(([key, label, hint]) => (
              <label key={key} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy[key]}
                  onChange={(e) => save({ [key]: e.target.checked } as Partial<Policy>)}
                  className="mt-0.5 rounded-[3px] border-border-strong text-primary focus:ring-ring"
                />
                <span className="text-[13px] text-foreground">
                  {label}
                  <span className="block text-[12px] text-ink-faint leading-snug">{hint}</span>
                </span>
              </label>
            ))}
            {nothingIncluded && <p className="text-[12px] text-warning">Pick at least one, or backups will be empty.</p>}
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="backup-keep" className="block text-[11.5px] font-semibold text-muted-foreground">Keep</label>
            <select
              id="backup-keep"
              value={policy.keep}
              onChange={(e) => save({ keep: Number(e.target.value) })}
              className="h-9 bg-surface border border-border rounded-[9px] px-2.5 text-[13px] text-foreground focus:outline-none focus:border-border-strong"
            >
              {KEEP_CHOICES.map((n) => <option key={n} value={n}>The newest {n}</option>)}
            </select>
            <p className="text-[12px] text-ink-faint">Older backups are deleted as new ones arrive. Each project keeps its own {policy.keep}.</p>
          </div>

          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-muted-foreground">Delivery</p>
            <label className={`flex items-start gap-2.5 ${emailAvailable ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={policy.email && emailAvailable}
                disabled={!emailAvailable}
                onChange={(e) => save({ email: e.target.checked })}
                className="mt-0.5 rounded-[3px] border-border-strong text-primary focus:ring-ring"
              />
              <span className="text-[13px] text-foreground">
                Also email each backup to me
                <span className="block text-[12px] text-ink-faint leading-snug">
                  {emailAvailable ? 'Attached when it’s under 10 MB; larger ones send a note instead.' : 'Email isn’t set up on this server, so backups are kept here to download.'}
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      <div aria-live="polite" className="min-h-[1rem] text-[12.5px]">
        {error ? <span className="text-danger">{error}</span> : notice ? <span className="text-success">{notice}</span> : saved ? <span className="text-ink-faint">Saved.</span> : null}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[11.5px] font-semibold text-muted-foreground mb-1">Your backups</p>
        {loading ? <div className="h-10 animate-pulse rounded-md bg-surface-raised" /> : <BackupList backups={backups} onDelete={remove} />}
      </div>
    </section>
  );
}

/** A project page's Backups block: its schedule, "Back up now", and its .zip files. */
export function ProjectBackups({ projectId }: { projectId: string }) {
  const { backups, extra, setExtra, loading, working, error, setError, notice, backUpNow, remove } = useBackups(projectId);
  const frequency = (extra?.frequency as Frequency | undefined) ?? 'OFF';

  const setFrequency = async (next: Frequency) => {
    const before = frequency;
    setExtra((e) => ({ ...(e ?? {}), frequency: next }));
    const res = await fetch('/api/backups/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, frequency: next }) });
    if (!res.ok) {
      setExtra((e) => ({ ...(e ?? {}), frequency: before }));
      setError('Couldn’t save the schedule. Try again.');
    }
  };

  return (
    <section aria-labelledby="project-backups-title" className="border-t border-border pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p id="project-backups-title" className="text-[11.5px] font-semibold text-ink-faint">Backups</p>
        <button
          type="button"
          onClick={backUpNow}
          disabled={working}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:text-primary-hover disabled:opacity-50"
        >
          {working ? <><RefreshCw className="h-3 w-3 animate-spin" /> Backing up…</> : 'Back up now'}
        </button>
      </div>
      <FrequencyPicker value={frequency} onChange={setFrequency} label="How often to back up this project" disabled={loading} />
      <p className="text-[12px] text-ink-faint leading-relaxed">
        {frequency === 'OFF'
          ? 'A .zip of this project’s notebooks and tasks, whenever you ask.'
          : `${scheduleNote(frequency)} What goes in follows Settings → Backups.`}
      </p>
      <div aria-live="polite" className="text-[12.5px]">
        {error ? <span className="text-danger">{error}</span> : notice ? <span className="text-success">{notice}</span> : null}
      </div>
      {loading ? <div className="h-10 animate-pulse rounded-md bg-surface-raised" /> : <BackupList backups={backups.slice(0, 5)} onDelete={remove} compact />}
    </section>
  );
}
