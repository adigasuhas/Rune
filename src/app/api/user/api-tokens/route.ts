import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateApiToken, MAX_API_TOKENS_PER_USER } from '@/lib/apiTokens';
import { enforceRateLimit } from '@/lib/rateLimit';

/**
 * Personal access tokens for the Rune MCP server / chat-bot integrations.
 * Managed only from a real browser session - a token can never mint,
 * list or revoke tokens (also blocked at the proxy, checked again here).
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

async function requireBrowserSession() {
  const session = await getSessionUser();
  if (!session) return { error: NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }) };
  if (session.viaApiToken) {
    return { error: NextResponse.json({ error: 'Access tokens can’t manage access tokens.' }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireBrowserSession();
  if (auth.error) return auth.error;

  const rows: TokenRow[] = await db.apiToken.findMany({ where: { userId: auth.session.userId } });
  const now = Date.now();
  const tokens = rows
    .filter((t) => !t.revokedAt)
    .map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      expired: !!t.expiresAt && new Date(t.expiresAt).getTime() <= now,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const auth = await requireBrowserSession();
  if (auth.error) return auth.error;
  const limited = enforceRateLimit(req, 'api-token-create', 10, 60 * 60_000, auth.session.userId);
  if (limited) return limited;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a token name (1 to 80 characters).' }, { status: 400 });
  }
  const { name, expiresInDays } = parsed.data;

  const existing: TokenRow[] = await db.apiToken.findMany({ where: { userId: auth.session.userId } });
  if (existing.filter((t) => !t.revokedAt).length >= MAX_API_TOKENS_PER_USER) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_API_TOKENS_PER_USER} active tokens. Revoke one first.` },
      { status: 400 }
    );
  }

  const { token, tokenHash, prefix } = generateApiToken();
  const row = await db.apiToken.create({
    data: {
      userId: auth.session.userId,
      name,
      tokenHash,
      prefix,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    },
  });

  // The plaintext token is returned exactly once and never stored.
  return NextResponse.json({ id: row.id, name: row.name, prefix, expiresAt: row.expiresAt, token }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBrowserSession();
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Token id is required.' }, { status: 400 });

  const row = await db.apiToken.findUnique({ where: { id } });
  if (!row || row.userId !== auth.session.userId) {
    return NextResponse.json({ error: 'Token not found.' }, { status: 404 });
  }
  await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ success: true });
}
