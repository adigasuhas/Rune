import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  buildDirectConversationKey,
  canAccessDirectChat,
  canAccessLeaderGroupChat,
  canAccessTeamChat,
  canAccessObjectChat
} from '@/lib/teams';
import { triggerNewChatMessage } from '@/lib/pusher';
import { createNotification } from '@/lib/notify';
import { enforceRateLimit } from '@/lib/rateLimit';

const MESSAGE_PAGE_SIZE = 50;

const sendSchema = z.object({
  scope: z.string().max(50),
  text: z.string().max(10_000),
  with: z.string().max(200).nullable().optional(),
  leaderId: z.string().max(200).nullable().optional(),
  objectType: z.string().max(50).nullable().optional(),
  objectId: z.string().max(200).nullable().optional(),
  mentionedUserIds: z.array(z.string().max(200)).optional(),
});

/** Resolves {scope, ...} query/body params into a conversationKey, checking the caller's access along the way. Returns null (with a response already sent by the caller) if invalid/forbidden. */
async function resolveConversation(
  teamId: string,
  requesterId: string,
  scope: string,
  otherUserId: string | null,
  leaderId: string | null,
  objectType: string | null,
  objectId: string | null
): Promise<{ conversationKey: string } | { error: string; status: number }> {
  if (scope === 'DIRECT') {
    if (!otherUserId) return { error: '"with" (the other user\'s id) is required for a DIRECT conversation', status: 400 };
    const allowed = await canAccessDirectChat(teamId, requesterId, otherUserId);
    if (!allowed) return { error: 'Not found', status: 404 };
    return { conversationKey: buildDirectConversationKey(requesterId, otherUserId) };
  }
  if (scope === 'LEADER_GROUP') {
    if (!leaderId) return { error: '"leaderId" is required for a LEADER_GROUP conversation', status: 400 };
    const allowed = await canAccessLeaderGroupChat(teamId, requesterId, leaderId);
    if (!allowed) return { error: 'Not found', status: 404 };
    return { conversationKey: leaderId };
  }
  if (scope === 'TEAM') {
    const allowed = await canAccessTeamChat(teamId, requesterId);
    if (!allowed) return { error: 'Not found', status: 404 };
    return { conversationKey: '' };
  }
  if (scope === 'OBJECT') {
    if (!objectType || !objectId) return { error: '"objectType" and "objectId" are required for an OBJECT conversation', status: 400 };
    const conversationKey = `${objectType}:${objectId}`;
    const allowed = await canAccessObjectChat(teamId, requesterId, conversationKey);
    if (!allowed) return { error: 'Not found', status: 404 };
    return { conversationKey };
  }
  return { error: 'scope must be DIRECT, LEADER_GROUP, TEAM, or OBJECT.', status: 400 };
}

/**
 * Whether `userId` can see the conversation `text` was just posted to -
 * checked again per mentioned person before notifying them. Team
 * membership alone isn't enough: mentioning a real teammate who isn't a
 * participant of this specific conversation (a DIRECT thread they're not
 * in, a LEADER_GROUP/OBJECT thread they can't view) would otherwise
 * notify them with a preview of a conversation they have no access to.
 */
async function canAccessConversation(teamId: string, userId: string, scope: string, conversationKey: string): Promise<boolean> {
  if (scope === 'TEAM') return canAccessTeamChat(teamId, userId);
  if (scope === 'LEADER_GROUP') return canAccessLeaderGroupChat(teamId, userId, conversationKey);
  if (scope === 'DIRECT') return conversationKey.split('_').includes(userId);
  if (scope === 'OBJECT') return canAccessObjectChat(teamId, userId, conversationKey);
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  // Generous - covers baseline 5s polling (when Pusher isn't configured)
  // plus debounced in-chat search typing comfortably; only stops abuse.
  const limited = enforceRateLimit(req, 'chat-read', 60, 60_000, session.userId);
  if (limited) return limited;

  const { id: teamId } = await params;
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') || '';
  const otherUserId = searchParams.get('with');
  const leaderId = searchParams.get('leaderId');
  const objectType = searchParams.get('objectType');
  const objectId = searchParams.get('objectId');
  const q = (searchParams.get('q') || '').trim();

  const resolved = await resolveConversation(teamId, session.userId, scope, otherUserId, leaderId, objectType, objectId);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // Sender name/avatar included so a consumer with no separate member
  // roster of its own (e.g. an OBJECT thread on a project/task page,
  // whose participants aren't a fixed, already-loaded team list the way
  // TEAM/LEADER_GROUP/DIRECT chat's caller always has) can render without
  // a second lookup. `q` searches within this one already-access-checked
  // conversation only - never across conversations the caller can't see.
  const messages = await db.chatMessage.findMany({
    where: {
      teamId,
      scope,
      conversationKey: resolved.conversationKey,
      ...(q ? { text: { contains: q, mode: 'insensitive' } } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: MESSAGE_PAGE_SIZE,
    include: { sender: { select: { name: true, email: true, avatarUrl: true } } }
  });

  return NextResponse.json([...messages].reverse());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const limited = enforceRateLimit(req, 'chat-send', 30, 60_000, session.userId);
  if (limited) return limited;

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { scope, text, with: otherUserId, leaderId, objectType, objectId, mentionedUserIds } = parsed.data;
  if (!text.trim()) {
    return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });
  }

  try {
    const { id: teamId } = await params;
    const resolved = await resolveConversation(teamId, session.userId, scope, otherUserId || null, leaderId || null, objectType || null, objectId || null);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const message = await db.chatMessage.create({
      data: {
        teamId,
        scope,
        conversationKey: resolved.conversationKey,
        senderId: session.userId,
        text: text.trim()
      },
      include: { sender: { select: { name: true, email: true, avatarUrl: true } } }
    });

    // Best-effort - if Pusher isn't configured, clients polling this
    // conversation still pick the message up on their next poll.
    await triggerNewChatMessage(teamId, scope, resolved.conversationKey, message);

    // @mentions - the client already resolved these to specific user ids
    // (picked from the team roster it already has loaded), so this is just
    // re-verifying access server-side rather than trusting the client's
    // selection outright, then notifying each one. Checked against this
    // specific conversation, not just team membership - a real teammate who
    // isn't actually a participant here (e.g. someone else's DIRECT thread)
    // must not get a notification previewing a conversation they can't open.
    if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
      const sender = await db.user.findUnique({ where: { id: session.userId } });
      const senderName = sender?.name || sender?.email || 'Someone';
      const uniqueMentions = Array.from(new Set(mentionedUserIds as string[])).filter((id) => id !== session.userId);
      for (const mentionedId of uniqueMentions) {
        if (!(await canAccessConversation(teamId, mentionedId, scope, resolved.conversationKey))) continue;
        await createNotification({
          userId: mentionedId,
          type: 'CHAT_MENTION',
          title: `${senderName} mentioned you`,
          body: text.trim().slice(0, 140),
          sourceType: 'Team',
          sourceId: teamId
        });
      }
    }

    return NextResponse.json(message);
  } catch (err) {
    console.error('Error sending chat message:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
