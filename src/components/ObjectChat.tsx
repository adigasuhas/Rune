'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { startVisiblePolling } from '@/lib/visiblePolling';

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  sender?: { name: string | null; email: string; avatarUrl: string | null } | null;
}

const POLL_INTERVAL_MS = 5000;

function senderLabel(m: ChatMessage): string {
  return m.sender?.name || m.sender?.email || 'Someone';
}

/**
 * A single contextual discussion thread anchored to a project or task
 * ("Discuss this project" / "Discuss this task") rather than a person or
 * group - the single-thread sibling of TeamChat, sharing the same
 * scope+conversationKey chat backend (scope: 'OBJECT',
 * conversationKey: '<objectType>:<objectId>'). Deliberately no
 * conversation-switcher chrome, since there's exactly one thread.
 */
export function ObjectChat({
  teamId,
  objectType,
  objectId,
  currentUserId,
  className = '',
  fillHeight = false
}: {
  teamId: string;
  objectType: 'project' | 'task';
  objectId: string;
  currentUserId: string;
  className?: string;
  /** Fill the parent's height (e.g. inside a drawer) instead of the default fixed h-96. */
  fillHeight?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const query = `scope=OBJECT&objectType=${objectType}&objectId=${objectId}`;

  useEffect(() => {
    let cancelled = false;
    let stopPolling: (() => void) | null = null;
    let pusherChannel: { unbind_all: () => void; unsubscribe: () => void } | null = null;
    let pusherClient: { disconnect: () => void } | null = null;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/chat?${query}`);
        if (res.ok && !cancelled) setMessages(await res.json());
      } catch (err) {
        console.error('Failed to load discussion messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    fetchMessages();

    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    const conversationKey = `${objectType}:${objectId}`;

    if (pusherKey && pusherCluster) {
      import('pusher-js').then(({ default: Pusher }) => {
        if (cancelled) return;
        const client = new Pusher(pusherKey, { cluster: pusherCluster, authEndpoint: '/api/pusher/auth' });
        pusherClient = client;
        const channel = client.subscribe(`private-chat-${teamId}::OBJECT::${conversationKey}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, objectType, objectId]);

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
        body: JSON.stringify({ scope: 'OBJECT', text: draft, objectType, objectId })
      });
      if (res.ok) {
        const message = await res.json();
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        setDraft('');
      }
    } catch (err) {
      console.error('Failed to send discussion message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`bg-surface border border-border rounded-md overflow-hidden flex flex-col ${fillHeight ? 'flex-1 h-full' : 'h-96'} ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <MessageSquare className="w-3.5 h-3.5 text-primary" /> Discussion
        </span>
        <span className={`text-[11.5px] font-semibold px-1.5 py-0.5 rounded-full ${realtimeActive ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted-foreground'}`}>
          {realtimeActive ? 'Live' : 'Auto-refresh'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No messages yet. Start the discussion.</p>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && <UserAvatar person={{ id: m.senderId, ...m.sender }} size={24} className="mb-0.5" />}
                <div className={`flex min-w-0 max-w-[80%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[9px] text-muted-foreground font-semibold mb-0.5">
                    {isMe ? 'You' : senderLabel(m)} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className={`px-3 py-2 rounded-md text-sm ${isMe ? 'bg-primary text-primary-foreground' : 'bg-surface-raised text-foreground'}`}>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-border">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
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
  );
}
