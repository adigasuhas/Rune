'use client';

import { LoadError } from '@/components/LoadError';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, ArrowRight, LogIn } from 'lucide-react';
import { Button, PageHeader, SectionHeader } from '@/components/ui';
import { Spot } from '@/components/brand/Spot';
import { Modal } from '@/components/Modal';

interface Team {
  id: string;
  name: string;
  myRole: 'OWNER' | 'TEAM_LEADER' | 'MEMBER';
  memberCount: number;
}

const ROLE_LABEL: Record<Team['myRole'], string> = {
  OWNER: 'Owner',
  TEAM_LEADER: 'Team leader',
  MEMBER: 'Member'
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinInput, setJoinInput] = useState('');

  const [loadFailed, setLoadFailed] = useState(false);
  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
      setLoadFailed(!res.ok);
      if (res.ok) setTeams(await res.json());
    } catch (err) {
      setLoadFailed(true);
      console.error('Error fetching teams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setIsCreateModalOpen(false);
        setNewTeamName('');
        setTeams((prev) => [...prev, data]);
      } else {
        setCreateError(data.error || 'Couldn’t create the team. Try again.');
      }
    } catch (err) {
      console.error('Error creating team:', err);
      setCreateError('Couldn’t create the team. Try again.');
    } finally {
      setCreating(false);
    }
  };

  // Accepts either a bare invite code or a full /teams/join/<code> link pasted in.
  const extractInviteCode = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/teams\/join\/([^/?#\s]+)/);
    return match ? match[1] : trimmed;
  };

  return (
    <div className="space-y-10 text-foreground">
      <PageHeader
        className=""
        title="Team"
        subtitle="Optional. Share projects, assign tasks and talk things through with your lab or group. Your personal work stays exactly as it is."
        actions={teams.length > 0 ? (
          <>
            <Button variant="ghost" onClick={() => setIsJoinModalOpen(true)}><LogIn className="w-4 h-4 text-ink-faint" /> Join a team</Button>
            <Button onClick={() => setIsCreateModalOpen(true)}><Plus className="w-4 h-4" /> Create a team</Button>
          </>
        ) : undefined}
      />

      {loading ? (
        <div className="space-y-3 animate-pulse">{[1, 2].map((i) => <div key={i} className="h-14 rounded-[10px] bg-surface-raised" />)}</div>
      ) : loadFailed && teams.length === 0 ? (
        <LoadError what="your teams" onRetry={fetchTeams} />
      ) : teams.length === 0 ? (
        <section className="grid items-center gap-10 rounded-[18px] border border-border bg-surface p-6 sm:p-10 lg:grid-cols-[auto_1fr]">
          <Spot kind="team" size={220} />
          <div>
            <h2 className="font-serif text-[28px] font-medium leading-tight tracking-[-0.015em]">Bring your people along, when you want to.</h2>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-secondary">
              A team shares projects you choose, lets leaders assign tasks, and gives everyone one place to talk. It works the same for a three-person reading group as for a forty-person lab.
            </p>
            <dl className="mt-7 grid gap-5 sm:grid-cols-3">
              {[
                ['Owner', 'Sets the team up, sees every team project, manages people.'],
                ['Team leader', 'Leads a sub-group: assigns tasks and follows their projects.'],
                ['Member', 'Works on the projects they’re added to. Nothing else changes.'],
              ].map(([role, what]) => (
                <div key={role} className="border-t border-foreground/75 pt-3">
                  <dt className="text-[14px] font-semibold">{role}</dt>
                  <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-secondary">{what}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button onClick={() => setIsCreateModalOpen(true)}><Plus className="w-4 h-4" /> Create a team</Button>
              <Button variant="ghost" onClick={() => setIsJoinModalOpen(true)}>I have an invite</Button>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <SectionHeader title="Your teams" meta={teams.length} />
          <ul className="divide-y divide-border">
            {teams.map((team) => (
              <li key={team.id}>
                <Link href={`/teams/${team.id}`} className="group flex items-center gap-4 py-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-surface-sunken font-serif text-[18px] font-medium text-foreground">
                    {team.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[19px] font-medium text-foreground group-hover:text-primary">{team.name}</span>
                    <span className="block text-[13px] text-ink-secondary">
                      {ROLE_LABEL[team.myRole]} · {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-[13.5px] font-medium text-ink-secondary group-hover:text-foreground">
                    Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isCreateModalOpen && (
        <Modal onClose={() => setIsCreateModalOpen(false)} size="sm">
          <Modal.Header title="Create team" onClose={() => setIsCreateModalOpen(false)} />
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div>
              <label htmlFor="page-team-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Team name *</label>
              <input id="page-team-name"
                type="text"
                autoFocus
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                required
                placeholder="e.g. Adiga Lab"
                className="w-full bg-surface-raised border border-border rounded-[6px] px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
              />
            </div>
            {createError && <p className="text-danger text-xs font-semibold">{createError}</p>}
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              You’ll be the team’s Owner. Creating a team turns on team features for your account. Your personal workspace stays as it is.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="h-9 px-4 bg-surface border border-border-strong text-foreground hover:bg-surface-raised text-[13.5px] font-semibold rounded-[9px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="h-9 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-[13.5px] font-semibold rounded-[9px] transition-colors cursor-pointer"
              >
                {creating ? 'Creating…' : 'Create team'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isJoinModalOpen && (
        <Modal onClose={() => setIsJoinModalOpen(false)} size="sm">
          <Modal.Header title="Join team" onClose={() => setIsJoinModalOpen(false)} />
          <div className="space-y-4">
            <div>
              <label htmlFor="page-invite-link-or-code" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Invite link or code</label>
              <input id="page-invite-link-or-code"
                type="text"
                autoFocus
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Paste an invite link or code"
                className="w-full bg-surface-raised border border-border rounded-[6px] px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsJoinModalOpen(false)}
                className="h-9 px-4 bg-surface border border-border-strong text-foreground hover:bg-surface-raised text-[13.5px] font-semibold rounded-[9px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Link
                href={joinInput.trim() ? `/teams/join/${extractInviteCode(joinInput)}` : '#'}
                className={`inline-flex h-9 items-center px-4 text-[13.5px] font-semibold rounded-[9px] transition-colors ${
                  joinInput.trim()
                    ? 'bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer'
                    : 'bg-surface-raised text-muted-foreground cursor-not-allowed pointer-events-none'
                }`}
              >
                Continue
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
