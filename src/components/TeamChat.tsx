'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MessageSquare, Send, Users, Crown, Search, AtSign } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { startVisiblePolling } from '@/lib/visiblePolling';
import { detectMentionTrigger, filterMentionCandidates, buildMentionHighlightPattern } from '@/lib/chatMentions';

type Role = 'OWNER' | 'TEAM_LEADER' | 'MEMBER';

interface Member {
  userId: string;
  role: Role;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface Subgroup {
  teamLeaderId: string;
  memberId: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

/** Renders `text` with any `@Full Name` substring matching a real member highlighted - purely visual, the mention notification itself already fired at send time via mentionedUserIds. */
function renderWithMentions(text: string, members: Member[]) {
  const pattern = buildMentionHighlightPattern(members.map(memberLabel));
  if (!pattern) return text;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<span key={match.index} className="font-semibold text-primary bg-primary-soft rounded px-1">@{match[1]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

type Scope = 'DIRECT' | 'LEADER_GROUP' | 'TEAM';

interface Conversation {
  scope: Scope;
  conversationKey: string; // '' for TEAM, otherUserId for DIRECT, leaderId for LEADER_GROUP
  label: string;
  icon: 'user' | 'leader' | 'team';
}

const POLL_INTERVAL_MS = 5000;

function memberLabel(m: Member | undefined): string {
  if (!m) return 'Unknown';
  return m.name || m.email;
}

/** Same pairing rule as src/lib/teams.ts's buildDirectConversationKey - order-independent so both participants land on the same thread. */
function directConversationKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('_');
}

export function TeamChat({
  teamId,
  currentUserId,
  myRole,
  members,
  subgroups,
  preselectUserId
}: {
  teamId: string;
  currentUserId: string;
  myRole: Role;
  members: Member[];
  subgroups: Subgroup[];
  /** Switches the open conversation to this member's DM, e.g. from a "Message" action elsewhere on the page. */
  preselectUserId?: string | null;
}) {
  const membersById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);

  const conversations = useMemo<Conversation[]>(() => {
    const list: Conversation[] = [{ scope: 'TEAM', conversationKey: '', label: 'Whole team', icon: 'team' }];

    if (myRole === 'OWNER') {
      for (const m of members) {
        if (m.role === 'TEAM_LEADER') {
          list.push({ scope: 'LEADER_GROUP', conversationKey: m.userId, label: `${memberLabel(m)}’s group`, icon: 'leader' });
        }
      }
    } else if (myRole === 'TEAM_LEADER') {
      list.push({ scope: 'LEADER_GROUP', conversationKey: currentUserId, label: 'My group', icon: 'leader' });
    } else {
      const myLeaderIds = subgroups.filter((s) => s.memberId === currentUserId).map((s) => s.teamLeaderId);
      for (const leaderId of myLeaderIds) {
        const leader = membersById.get(leaderId);
        list.push({ scope: 'LEADER_GROUP', conversationKey: leaderId, label: `${memberLabel(leader)}’s group`, icon: 'leader' });
      }
    }

    for (const m of members) {
      if (m.userId === currentUserId) continue;
      list.push({ scope: 'DIRECT', conversationKey: m.userId, label: memberLabel(m), icon: 'user' });
    }

    return list;
  }, [members, subgroups, myRole, currentUserId, membersById]);

  const [selected, setSelected] = useState<Conversation>(conversations[0]);

  useEffect(() => {
    if (!preselectUserId) return;
    const target = conversations.find((c) => c.scope === 'DIRECT' && c.conversationKey === preselectUserId);
    if (target) setSelected(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectUserId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionState, setMentionState] = useState<{ query: string; matches: Member[]; activeIndex: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const buildQuery = useCallback((conv: Conversation, q: string) => {
    const params = new URLSearchParams({ scope: conv.scope });
    if (conv.scope === 'DIRECT') params.set('with', conv.conversationKey);
    if (conv.scope === 'LEADER_GROUP') params.set('leaderId', conv.conversationKey);
    if (q.trim()) params.set('q', q.trim());
    return params.toString();
  }, []);

  // Debounce the search query so every keystroke doesn't refetch.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    let stopPolling: (() => void) | null = null;
    let pusherChannel: { unbind_all: () => void; unsubscribe: () => void } | null = null;
    let pusherClient: { disconnect: () => void } | null = null;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/chat?${buildQuery(selected, debouncedSearch)}`);
        if (res.ok && !cancelled) setMessages(await res.json());
      } catch (err) {
        console.error('Failed to load chat messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    fetchMessages();

    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (pusherKey && pusherCluster) {
      import('pusher-js').then(({ default: Pusher }) => {
        if (cancelled) return;
        const client = new Pusher(pusherKey, { cluster: pusherCluster, authEndpoint: '/api/pusher/auth' });
        pusherClient = client;
        const channelName = `private-chat-${teamId}::${selected.scope}::${selected.conversationKey}`;
        const channel = client.subscribe(channelName);
        pusherChannel = channel;
        channel.bind('new-message', (message: ChatMessage) => {
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        });
        setRealtimeActive(true);
      }).catch((err) => {
        console.error('Failed to load Pusher client, falling back to polling:', err);
        if (!cancelled) stopPolling = startVisiblePolling(fetchMessages, POLL_INTERVAL_MS);
      });
    } else {
      setRealtimeActive(false);
      stopPolling = startVisiblePolling(fetchMessages, POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      stopPolling?.();
      if (pusherChannel) {
        pusherChannel.unbind_all();
        pusherChannel.unsubscribe();
      }
      if (pusherClient) pusherClient.disconnect();
    };
  }, [teamId, selected, buildQuery, debouncedSearch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: selected.scope,
          text: draft,
          with: selected.scope === 'DIRECT' ? selected.conversationKey : undefined,
          leaderId: selected.scope === 'LEADER_GROUP' ? selected.conversationKey : undefined,
          mentionedUserIds
        })
      });
      if (res.ok) {
        const message = await res.json();
        // Pusher won't echo the sender's own trigger back to them in most
        // setups, and the polling fallback might not fire for several
        // seconds - append locally so sending always feels instant.
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        setDraft('');
        setMentionedUserIds([]);
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
    } finally {
      setSending(false);
    }
  };

  /** Detects a trailing `@partial` in the draft and opens/updates/closes the mention dropdown accordingly. */
  const updateMentionFromCaret = (value: string, cursor: number) => {
    const query = detectMentionTrigger(value.slice(0, cursor));
    if (query === null) { setMentionState(null); return; }
    const candidates = members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => ({ ...m, label: memberLabel(m) }));
    const matches = filterMentionCandidates(candidates, query);
    if (matches.length === 0) { setMentionState(null); return; }
    setMentionState({ query, matches, activeIndex: 0 });
  };

  const applyMention = (member: Member) => {
    if (!mentionState || !messageInputRef.current) return;
    const cursor = messageInputRef.current.selectionStart ?? draft.length;
    const start = cursor - 1 - mentionState.query.length; // back up over "@query"
    const name = memberLabel(member);
    const newDraft = draft.slice(0, start) + `@${name} ` + draft.slice(cursor);
    setDraft(newDraft);
    setMentionedUserIds((prev) => (prev.includes(member.userId) ? prev : [...prev, member.userId]));
    setMentionState(null);
    requestAnimationFrame(() => {
      const pos = start + name.length + 2;
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionState) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionState((s) => s && { ...s, activeIndex: (s.activeIndex + 1) % s.matches.length }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionState((s) => s && { ...s, activeIndex: (s.activeIndex - 1 + s.matches.length) % s.matches.length }); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionState.matches[mentionState.activeIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); setMentionState(null); }
  };

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden flex flex-col md:flex-row h-[32rem]">
      <div className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto">
        {conversations.map((conv) => (
          <button
            key={`${conv.scope}-${conv.conversationKey}`}
            type="button"
            onClick={() => setSelected(conv)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
              selected.scope === conv.scope && selected.conversationKey === conv.conversationKey
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground'
            }`}
          >
            {conv.icon === 'team' && <MessageSquare className="w-3.5 h-3.5 shrink-0" />}
            {conv.icon === 'leader' && <Crown className="w-3.5 h-3.5 shrink-0" />}
            {conv.icon === 'user' && <Users className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate">{conv.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border gap-2">
          <span className="text-xs font-bold text-foreground shrink-0">{selected.label}</span>
          <div className="flex items-center gap-2 min-w-0">
            {showSearch && (
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
                placeholder="Search this conversation…"
                aria-label="Search this conversation"
                className="w-40 bg-surface-raised border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-border-strong"
              />
            )}
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${showSearch ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label="Search this conversation"
              title="Search this conversation"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <span className={`text-[11.5px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${realtimeActive ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted-foreground'}`}>
              {realtimeActive ? 'Live' : 'Auto-refresh'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{debouncedSearch ? 'No messages match your search.' : 'No messages yet. Say hello.'}</p>
          ) : (
            messages.map((m) => {
              const sender = membersById.get(m.senderId);
              const isMe = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && <UserAvatar person={{ id: m.senderId, ...sender }} size={24} className="mb-0.5" />}
                  <div className={`flex min-w-0 max-w-[80%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] text-muted-foreground font-semibold mb-0.5">
                      {isMe ? 'You' : memberLabel(sender)} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className={`px-3 py-2 rounded-md text-sm ${isMe ? 'bg-primary text-primary-foreground' : 'bg-surface-raised text-foreground'}`}>
                      {renderWithMentions(m.text, members)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="relative flex items-center gap-2 p-3 border-t border-border">
          {mentionState && (
            <div className="absolute bottom-full left-3 mb-1 w-56 max-h-48 overflow-y-auto bg-card border border-border-strong rounded-md shadow-[var(--shadow-modal)] py-1 z-20">
              {mentionState.matches.map((m, i) => (
                <button
                  key={m.userId}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMention(m)}
                  onMouseEnter={() => setMentionState((s) => s && { ...s, activeIndex: i })}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs cursor-pointer ${i === mentionState.activeIndex ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-surface-sunken'}`}
                >
                  <AtSign className="w-3 h-3 shrink-0 text-ink-faint" />
                  <span className="truncate">{memberLabel(m)}</span>
                </button>
              ))}
            </div>
          )}
          <input
            ref={messageInputRef}
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); updateMentionFromCaret(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
            onKeyDown={handleInputKeyDown}
            onBlur={() => setMentionState(null)}
            placeholder="Message (type @ to mention)"
            aria-label="Message"
            className="flex-1 bg-surface-raised border border-border rounded-md px-3.5 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-border-strong"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="p-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground rounded-md transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// Referenced only for the type re-export used by directConversationKey's
// callers elsewhere if ever needed - keeps the helper colocated with the
// component that owns the pairing logic on the client side.
export { directConversationKey };
