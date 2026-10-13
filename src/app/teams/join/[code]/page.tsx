'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, CheckCircle2, AlertCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ code: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  TEAM_LEADER: 'Team leader',
  MEMBER: 'Member'
};

export default function JoinTeamPage({ params }: PageProps) {
  const { code } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ teamName: string; role: string; alreadyMember: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/teams/invites/${code}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setPreview(data);
        } else {
          setError(data.error || 'This invite link is invalid.');
        }
      })
      .catch(() => setError('This invite link is invalid.'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/invites/${code}/redeem`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTeamId(data.teamId);
      } else {
        setError(data.error || 'Couldn’t join the team. Try again.');
      }
    } catch (err) {
      console.error('Error joining team:', err);
      setError('Couldn’t join the team. Try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm bg-card border border-border rounded-md p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-md bg-primary-soft flex items-center justify-center">
          <Users className="w-6 h-6 text-primary" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Checking invite…</p>
        ) : teamId ? (
          <>
            <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
            <h1 className="text-lg font-bold text-foreground">You’ve joined the team</h1>
            <p className="text-sm text-muted-foreground">Welcome to {preview?.teamName}.</p>
            <button
              type="button"
              onClick={() => router.push(`/teams/${teamId}`)}
              className="w-full px-4 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-md transition-colors cursor-pointer"
            >
              Go to team
            </button>
          </>
        ) : error ? (
          <>
            <AlertCircle className="w-8 h-8 text-danger mx-auto" />
            <h1 className="text-lg font-bold text-foreground">Can’t join this team</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link
              href="/teams"
              className="inline-block w-full px-4 py-2.5 bg-surface-raised border border-border-strong text-foreground text-sm font-bold rounded-md transition-colors"
            >
              Back to teams
            </Link>
          </>
        ) : preview?.alreadyMember ? (
          <>
            <h1 className="text-lg font-bold text-foreground">Already a member</h1>
            <p className="text-sm text-muted-foreground">You’re already part of {preview.teamName}.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-foreground">Join {preview?.teamName}?</h1>
            <p className="text-sm text-muted-foreground">
              You’ll join as a <strong className="text-foreground">{ROLE_LABEL[preview?.role || 'MEMBER']}</strong>.
            </p>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="w-full px-4 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-sm font-bold rounded-md transition-colors cursor-pointer"
            >
              {joining ? 'Joining…' : 'Join team'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
