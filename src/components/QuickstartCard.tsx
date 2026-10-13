'use client';

import { useState } from 'react';
import { GITHUB_CLONE_URL } from '@/lib/links';

/**
 * Self-host quickstart: the real commands, by install method, with copy.
 * `npm run setup` (scripts/setup.mjs) asks a few questions, writes .env and
 * prints the exact next steps for the target you picked, so these stay
 * short on purpose.
 */
const TABS: { id: string; label: string; lines: { cmd: string; note?: string }[] }[] = [
  {
    id: 'local',
    label: 'On your laptop',
    lines: [
      { cmd: `git clone ${GITHUB_CLONE_URL}` },
      { cmd: 'cd Rune' },
      { cmd: 'npm install' },
      { cmd: 'npm run setup', note: 'answers a few questions, writes .env' },
      { cmd: 'npm run dev:db', note: 'terminal 1: local Postgres' },
      { cmd: 'npm run dev', note: 'terminal 2: http://localhost:3000' },
    ],
  },
  {
    id: 'docker',
    label: 'Docker',
    lines: [
      { cmd: `git clone ${GITHUB_CLONE_URL}` },
      { cmd: 'cd Rune' },
      { cmd: 'npm run setup', note: 'pick “My own server or Docker”' },
      { cmd: 'docker compose up -d --build', note: 'Postgres + Rune, migrations applied' },
    ],
  },
];

export function QuickstartCard({ className = '' }: { className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = TABS[active];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.lines.map((l) => l.cmd).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused - the commands are on screen to copy by hand */
    }
  };

  return (
    <div className={`vignette ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-2 py-2">
        <div role="tablist" aria-label="Install method" className="flex gap-1">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => { setActive(i); setCopied(false); }}
              className={`rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors ${
                i === active ? 'bg-surface-raised font-medium text-foreground' : 'text-ink-secondary hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="rounded-[8px] px-3 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-live="polite"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div role="tabpanel" tabIndex={0} aria-label={`${tab.label} commands`} className="overflow-x-auto px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60">
        <ol className="space-y-1.5 font-mono text-[13.5px] leading-relaxed">
          {tab.lines.map((l) => (
            <li key={l.cmd} className="flex flex-wrap items-baseline gap-x-3 whitespace-nowrap">
              <span>
                <span className="mr-2.5 select-none text-primary" aria-hidden="true">$</span>
                <span className="text-foreground">{l.cmd}</span>
              </span>
              {l.note && <span className="font-sans text-[12.5px] text-ink-faint"># {l.note}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
