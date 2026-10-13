'use client';

import katex from 'katex';
import { FeatureIcon, type FeatureKey } from './FeatureIcons';

/**
 * Feature illustrations for /features: each one a small, legible slice of
 * the real interface with believable data, rather than a full-app
 * screenshot shrunk until nothing can be read. They use the app's own
 * tokens, so they follow the theme, and they're decorative (aria-hidden) -
 * the copy beside each one carries the meaning.
 */

function Frame({ icon, title, meta, children }: { icon: FeatureKey; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="vignette select-none" aria-hidden="true">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold">
          <FeatureIcon name={icon} size={18} className="text-ink-secondary" />
          {title}
        </span>
        {meta && <span className="text-[12.5px] text-ink-faint">{meta}</span>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

const Pill = ({ tone, children }: { tone: 'pine' | 'clay' | 'ochre' | 'slate' | 'neutral'; children: React.ReactNode }) => {
  const t = {
    pine: 'bg-primary-soft text-primary',
    clay: 'bg-danger-soft text-danger',
    ochre: 'bg-warning-soft text-warning',
    slate: 'bg-info-soft text-info',
    neutral: 'bg-surface-raised text-ink-secondary',
  }[tone];
  return <span className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium ${t}`}>{children}</span>;
};

/* ---------------------------------------------------------------- Today */
export function TodayVignette() {
  const hours = ['09', '10', '11', '12', '13', '14'];
  return (
    <Frame icon="today" title="Today" meta="Thursday 9 October">
      <div className="grid grid-cols-[1fr_120px] gap-4 sm:grid-cols-[1fr_150px]">
        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="flex h-12 items-start gap-3 border-t border-border/70">
              <span className="-mt-[9px] w-6 bg-card text-[11.5px] text-ink-faint tnum">{h}</span>
            </div>
          ))}
          <Block top={0} height={96} deep title="Write methods section" sub="Deep work" />
          <Block top={120} height={36} title="Lab meeting" sub="Room 2.14" />
          <Block top={192} height={48} title="Reply to reviewer 2" sub="Focus" />
        </div>
        <div className="space-y-3">
          <div className="rounded-[10px] border border-border p-3 text-center">
            <ScoreRing value={78} />
            <p className="mt-1 text-[11.5px] text-ink-faint">Daily score</p>
          </div>
          <div className="rounded-[10px] border border-border p-3">
            <p className="text-[11.5px] font-medium text-ink-faint">Up next</p>
            <p className="mt-1 text-[12.5px] font-medium leading-snug">Order more buffer</p>
          </div>
          <div className="rounded-[10px] border border-danger/30 bg-danger-soft/50 p-3">
            <p className="text-[11.5px] font-medium text-danger">Needs attention</p>
            <p className="mt-1 text-[12.5px] leading-snug">Ethics form, 2 days late</p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Block({ top, height, title, sub, deep }: { top: number; height: number; title: string; sub: string; deep?: boolean }) {
  return (
    <div
      className={`absolute left-9 right-0 rounded-[8px] border-l-[3px] px-2.5 py-1.5 ${deep ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface-raised'}`}
      style={{ top: top + 3, height: height - 6 }}
    >
      <p className="truncate text-[12.5px] font-semibold">{title}</p>
      {height > 40 && <p className="text-[11.5px] text-ink-secondary">{sub}</p>}
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const c = 2 * Math.PI * 22;
  return (
    <svg viewBox="0 0 56 56" className="mx-auto h-16 w-16">
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--surface-sunken)" strokeWidth="5" />
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{value}</text>
    </svg>
  );
}

/* ---------------------------------------------------------------- Tasks */
export function TasksVignette() {
  const rows: { name: string; pri: [string, 'clay' | 'ochre' | 'slate' | 'neutral']; session: string; meta: string; done?: boolean; moved?: number }[] = [
    { name: 'Rerun the control with fresh enzyme', pri: ['High', 'ochre'], session: 'Deep work', meta: 'Today' },
    { name: 'Reply to reviewer 2', pri: ['Critical', 'clay'], session: 'Focus', meta: 'Fri', moved: 2 },
    { name: 'Book the confocal for next week', pri: ['Medium', 'slate'], session: 'Regular', meta: 'Mon' },
    { name: 'Submit conference abstract', pri: ['High', 'ochre'], session: 'Focus', meta: 'Done', done: true },
  ];
  return (
    <Frame icon="tasks" title="Tasks" meta="Thesis · 12 open">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 py-3">
            <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border ${r.done ? 'border-primary bg-primary' : 'border-border-strong'}`}>
              {r.done && <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round"><path d="M2.5 6.3l2.2 2.2 4.8-5" /></svg>}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[13.5px] font-medium ${r.done ? 'text-ink-faint line-through' : ''}`}>{r.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Pill tone={r.pri[1]}>{r.pri[0]}</Pill>
                <Pill tone={r.session === 'Deep work' ? 'pine' : 'neutral'}>{r.session}</Pill>
                {r.moved && <span className="text-[11.5px] text-ink-faint">postponed {r.moved}×</span>}
              </div>
            </div>
            <span className="shrink-0 text-[12px] text-ink-faint">{r.meta}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Projects */
export function ProjectsVignette() {
  const objectives: [string, boolean][] = [
    ['Pilot study with 12 participants', true],
    ['Pre-register the analysis plan', true],
    ['Collect the main dataset', false],
    ['Draft chapter 4', false],
  ];
  return (
    <Frame icon="projects" title="Projects" meta="3 active">
      <div className="flex items-start gap-5">
        <div className="relative shrink-0">
          <svg viewBox="0 0 80 80" className="h-24 w-24">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface-sunken)" strokeWidth="7" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${0.5 * 201} 201`} transform="rotate(-90 40 40)" />
            <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--text)">50%</text>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold">Attention and sleep</p>
            <Pill tone="pine">Active</Pill>
            <Pill tone="ochre">High</Pill>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">Deadline 14 Dec · 2 collaborators</p>
          <ul className="mt-3 space-y-1.5">
            {objectives.map(([o, done]) => (
              <li key={o} className="flex items-center gap-2 text-[13px]">
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] ${done ? 'border-primary bg-primary' : 'border-border-strong'}`} />
                <span className={done ? 'text-ink-faint line-through' : ''}>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        {[['notebook', 'Lab notebook'], ['runs', 'EEG preprocessing · 3 runs'], ['wall', 'Wall · 7 notes']].map(([k, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1.5 text-[12.5px] text-ink-secondary">
            <FeatureIcon name={k as FeatureKey} size={15} /> {label}
          </span>
        ))}
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Notebook */
const MATH = katex.renderToString(String.raw`\Delta G^\circ = -RT\ln K_d`, { throwOnError: false, displayMode: true });
export function NotebookVignette() {
  return (
    <Frame icon="notebook" title="Notebook" meta="Saved · version 31">
      <div className="grid gap-4 sm:grid-cols-2">
        <pre className="overflow-hidden rounded-[10px] bg-surface-sunken p-3.5 font-mono text-[12px] leading-[1.7] text-ink-secondary">
          <span className="text-primary">\section</span>{'{Results}\n'}
          {'Binding was measured at\n'}
          {'four temperatures '}<span className="text-primary">\cite</span>{'{lee2021}.\n\n'}
          <span className="text-primary">\begin</span>{'{equation}\n'}
          {'  \\Delta G^\\circ = -RT\\ln K_d\n'}
          <span className="text-primary">\end</span>{'{equation}\n'}
          {'See Fig.~'}<span className="text-primary">\ref</span>{'{fig:vant}.'}
        </pre>
        <div className="rounded-[10px] border border-border px-4 py-3.5 font-serif">
          <p className="text-[17px] font-semibold">3 &nbsp;Results</p>
          <p className="mt-1.5 text-[14px] leading-relaxed">
            Binding was measured at four temperatures [12].
          </p>
          <div className="text-[15px] [&_.katex-display]:my-2.5" dangerouslySetInnerHTML={{ __html: MATH }} />
          <p className="text-[14px] leading-relaxed">See Fig. 4.</p>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Runs */
export function RunsVignette() {
  return (
    <Frame icon="runs" title="Runs" meta="Cluster · Confocal">
      <ul className="space-y-3">
        <li className="rounded-[10px] border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold">DFT relax · Pt(111) slab</p>
            <Pill tone="pine">Running</Pill>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full w-[72%] rounded-full bg-primary" /></div>
          <p className="mt-1.5 text-[12px] text-ink-faint tnum">Attempt 2 of 2 · 72% · check in at 14:40</p>
        </li>
        <li className="flex items-center justify-between gap-2 rounded-[10px] border border-border p-3.5">
          <div>
            <p className="text-[13.5px] font-semibold">Confocal · slide 4B</p>
            <p className="mt-0.5 text-[12px] text-ink-faint">Booked 16:00 – 18:00 · 63× oil</p>
          </div>
          <Pill tone="slate">Queued</Pill>
        </li>
        <li className="rounded-[10px] border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold">DFT relax · attempt 1</p>
            <Pill tone="clay">Failed</Pill>
          </div>
          <p className="mt-1 text-[12px] text-ink-faint">Out of memory at step 212 · resubmitted with 2× nodes</p>
        </li>
      </ul>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Wall */
export function WallVignette() {
  const notes: { text: string; rot: number; tone: string; x: string; y: string }[] = [
    { text: 'Is the effect just caffeine? Control for it.', rot: -3, tone: 'bg-warning-soft', x: '4%', y: '6%' },
    { text: 'Ask Ishan about the old dataset', rot: 2.5, tone: 'bg-primary-soft', x: '52%', y: '2%' },
    { text: 'Fig. 3 colours are unreadable in print', rot: 1.5, tone: 'bg-info-soft', x: '10%', y: '52%' },
    { text: 'Idea: replicate on night-shift workers?', rot: -2, tone: 'bg-danger-soft', x: '55%', y: '48%' },
  ];
  return (
    <Frame icon="wall" title="Wall" meta="Attention and sleep">
      <div className="relative h-[230px]">
        {notes.map((n) => (
          <div
            key={n.text}
            className={`absolute w-[42%] rounded-[6px] p-3 text-[13px] leading-snug text-foreground shadow-[0_8px_18px_-12px_rgb(0_0_0/0.4)] ${n.tone}`}
            style={{ left: n.x, top: n.y, transform: `rotate(${n.rot}deg)` }}
          >
            {n.text}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Analytics */
export function AnalyticsVignette() {
  const week: [string, number, number][] = [['Mon', 3.5, 2], ['Tue', 4, 1.5], ['Wed', 1.5, 3.5], ['Thu', 5, 1], ['Fri', 2.5, 2.5]];
  const max = 6.5;
  const heat = [0, 2, 3, 1, 3, 0, 0, 1, 3, 2, 2, 3, 0, 0, 2, 2, 1, 3, 3, 0, 0, 3, 2, 3, 1, 2, 0, 0];
  return (
    <Frame icon="analytics" title="Analytics" meta="Last 4 weeks">
      <div className="grid gap-5 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-3 flex gap-4 text-[12px] text-ink-secondary">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" /> Deep work</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-border-strong" /> Shallow</span>
          </div>
          <div className="flex h-36 items-end gap-3 border-b border-border">
            {week.map(([d, deep, shallow]) => (
              <div key={d} className="flex flex-1 flex-col items-stretch gap-[3px]">
                <div className="rounded-t-[4px] bg-border-strong" style={{ height: `${(shallow / max) * 136}px` }} />
                <div className="rounded-b-[2px] rounded-t-[2px] bg-primary" style={{ height: `${(deep / max) * 136}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">{week.map(([d]) => <span key={d} className="flex-1 text-center text-[11.5px] text-ink-faint">{d}</span>)}</div>
        </div>
        <div>
          <p className="text-[12px] font-medium text-ink-secondary">Completed tasks per day</p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {heat.map((v, i) => (
              <span
                key={i}
                className="aspect-square rounded-[4px]"
                style={{ background: v === 0 ? 'var(--surface-sunken)' : `color-mix(in srgb, var(--primary) ${25 + v * 25}%, transparent)` }}
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">Weekends left blank: they aren’t working days.</p>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Teams */
export function TeamsVignette() {
  const people: [string, string, string][] = [['MK', 'Mei Kobayashi', 'Owner'], ['RA', 'Rahul Agarwal', 'Team leader'], ['JO', 'Joel Okafor', 'Member']];
  return (
    <Frame icon="teams" title="Lab" meta="Kobayashi group · 6 people">
      <div className="grid gap-4 sm:grid-cols-2">
        <ul className="space-y-2.5">
          {people.map(([i, n, r]) => (
            <li key={n} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface-raised text-[12px] font-semibold text-ink-secondary">{i}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{n}</span>
                <span className="text-[11.5px] text-ink-faint">{r}</span>
              </span>
            </li>
          ))}
          <li className="rounded-[10px] border border-border p-3 text-[12.5px]">
            <span className="text-ink-faint">Assigned to Joel by Rahul</span>
            <p className="mt-0.5 font-medium">Calibrate the plate reader</p>
          </li>
        </ul>
        <div className="flex flex-col gap-2 rounded-[10px] bg-surface-raised p-3 text-[12.5px]">
          <div className="max-w-[90%] self-start rounded-[10px] rounded-bl-[3px] bg-card px-3 py-2">
            <span className="block text-[11px] font-medium text-ink-faint">Rahul</span>
            Plate reader is free after 3, if anyone needs it.
          </div>
          <div className="max-w-[90%] self-end rounded-[10px] rounded-br-[3px] bg-primary px-3 py-2 text-primary-foreground">
            Taking it. Thanks!
          </div>
          <div className="max-w-[90%] self-start rounded-[10px] rounded-bl-[3px] bg-card px-3 py-2">
            <span className="block text-[11px] font-medium text-ink-faint">Mei</span>
            Group meeting moved to Thursday.
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- Hero */
/**
 * The /features hero: one Thursday, with something from each of the three
 * groups below it - the day's plan, a running job and a notebook, a message
 * from the lab - sitting in the same list. The rows arrive one after another
 * once, then stay put.
 */
export function HeroPreview() {
  const groups: { label: string; rows: { icon: FeatureKey; title: string; meta: React.ReactNode; tail?: React.ReactNode }[] }[] = [
    {
      label: 'Your day',
      rows: [
        { icon: 'today', title: 'Write methods section', meta: <span className="tnum">09:00 – 11:00</span>, tail: <Pill tone="pine">Deep work</Pill> },
        { icon: 'tasks', title: 'Reply to reviewer 2', meta: 'Due Friday · postponed 2×', tail: <Pill tone="clay">Critical</Pill> },
      ],
    },
    {
      label: 'Your work',
      rows: [
        {
          icon: 'runs', title: 'DFT relax · Pt(111) slab',
          meta: (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken"><span className="block h-full w-[72%] rounded-full bg-primary" /></span>
              <span className="tnum">72% · check in 14:40</span>
            </span>
          ),
          tail: <Pill tone="pine">Running</Pill>,
        },
        { icon: 'notebook', title: 'Lab notebook · 3 Results', meta: 'Saved · version 31' },
      ],
    },
    {
      label: 'Your people',
      rows: [{ icon: 'teams', title: 'Mei: group meeting moved to Thursday', meta: 'Kobayashi group' }],
    },
  ];
  return (
    <div className="vignette select-none" aria-hidden="true">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="text-[13.5px] font-semibold">Thursday 9 October</span>
        <span className="text-[12.5px] text-ink-faint">5 things, one list</span>
      </div>
      <div className="px-4 pb-2 pt-1 sm:px-5">
        {groups.map((g, gi) => (
          <div key={g.label} className="border-b border-border/70 py-2.5 last:border-b-0">
            <p className="pb-1 text-[11.5px] font-medium text-ink-faint">{g.label}</p>
            <ul>
              {g.rows.map((r, ri) => (
                <li key={r.title} className="hero-in flex items-center gap-3 py-1.5" style={{ animationDelay: `${260 + (gi * 2 + ri) * 110}ms` }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-border bg-surface-raised text-ink-secondary">
                    <FeatureIcon name={r.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
                    <span className="block text-[12px] text-ink-faint">{r.meta}</span>
                  </span>
                  {r.tail && <span className="shrink-0">{r.tail}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
