import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { parseChatChannelName, signPusherChannelAuth } from '@/lib/pusher';
import { canAccessDirectChat, canAccessLeaderGroupChat, canAccessTeamChat, canAccessObjectChat } from '@/lib/teams';

/**
 * Pusher's client SDK POSTs here (form-encoded: socket_id, channel_name)
 * whenever it subscribes to a private channel - this is the one place that
 * actually decides whether the requester may listen on that specific chat
 * conversation, reusing the exact same RBAC helpers the REST endpoint uses,
 * so there's exactly one definition of "who can see this conversation."
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const form = await req.formData();
  const socketId = form.get('socket_id')?.toString();
  const channelName = form.get('channel_name')?.toString();
  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'socket_id and channel_name are required.' }, { status: 400 });
  }

  const parsed = parseChatChannelName(channelName);
  if (!parsed) {
    return NextResponse.json({ error: 'Not a recognized chat channel.' }, { status: 403 });
  }
  const { teamId, scope, conversationKey } = parsed;

  let allowed = false;
  if (scope === 'DIRECT') {
    // conversationKey is the sorted pair - whichever half isn't the caller is the other participant.
    const other = conversationKey.split('_').find((u) => u !== session.userId);
    allowed = Boolean(other) && (await canAccessDirectChat(teamId, session.userId, other!));
  } else if (scope === 'LEADER_GROUP') {
    allowed = await canAccessLeaderGroupChat(teamId, session.userId, conversationKey);
  } else if (scope === 'TEAM') {
    allowed = await canAccessTeamChat(teamId, session.userId);
  } else if (scope === 'OBJECT') {
    allowed = await canAccessObjectChat(teamId, session.userId, conversationKey);
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authResponse = signPusherChannelAuth(socketId, channelName);
  if (!authResponse) {
    return NextResponse.json({ error: 'Realtime chat isn’t set up on this deployment.' }, { status: 503 });
  }

  return NextResponse.json(authResponse);
}

export const dynamic = 'force-dynamic';
