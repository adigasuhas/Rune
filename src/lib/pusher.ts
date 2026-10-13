import Pusher from 'pusher';

// Chat's real-time transport - entirely optional. If these env vars aren't
// set, every function here is a safe no-op and the client falls back to
// polling (see src/components/ClientLayout.tsx-style pattern, applied in
// the chat UI) - consistent with every other integration in this app never
// being a hard requirement to run Rune at all.
let cachedServer: Pusher | null | undefined;

function getPusherServer(): Pusher | null {
  if (cachedServer !== undefined) return cachedServer;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    cachedServer = null;
    return null;
  }
  cachedServer = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true
  });
  return cachedServer;
}

export function isPusherConfigured(): boolean {
  return getPusherServer() !== null;
}

/** "::" as a separator since teamId/userId are UUIDs (already contain hyphens) and conversationKey can contain underscores - avoids any ambiguity when the auth route parses this back apart. */
export function chatChannelName(teamId: string, scope: string, conversationKey: string): string {
  return `private-chat-${teamId}::${scope}::${conversationKey}`;
}

export function parseChatChannelName(channel: string): { teamId: string; scope: string; conversationKey: string } | null {
  const match = channel.match(/^private-chat-(.+)::(.+)::(.*)$/);
  if (!match) return null;
  return { teamId: match[1], scope: match[2], conversationKey: match[3] };
}

/** Fire-and-forget - a Pusher hiccup should never fail the message send the user is waiting on (same best-effort posture as every other external push in this app). */
export async function triggerNewChatMessage(
  teamId: string,
  scope: string,
  conversationKey: string,
  message: unknown
): Promise<void> {
  const pusher = getPusherServer();
  if (!pusher) return;
  try {
    await pusher.trigger(chatChannelName(teamId, scope, conversationKey), 'new-message', message);
  } catch (err) {
    console.error('Pusher trigger failed:', err);
  }
}

/** Signs the private-channel subscription response Pusher's client SDK expects. Caller (the /api/pusher/auth route) must already have verified the requester is allowed on this channel before calling this. */
export function signPusherChannelAuth(socketId: string, channel: string): Pusher.ChannelAuthResponse | null {
  const pusher = getPusherServer();
  if (!pusher) return null;
  return pusher.authorizeChannel(socketId, channel);
}
