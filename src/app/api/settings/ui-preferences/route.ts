import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Small UI choices that follow the person across devices: which sections are open, and the like. */
const KEY = /^[a-z][a-zA-Z0-9.-]{0,79}$/;
const MAX_KEYS = 200;
const value = z.union([z.boolean(), z.number(), z.string().max(200), z.null()]);
const patchSchema = z.record(z.string().regex(KEY), value).refine((o) => Object.keys(o).length <= 50, 'Too many at once.');

type Prefs = Record<string, boolean | number | string>;

function asPrefs(v: unknown): Prefs {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Prefs) : {};
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const setting = await db.setting.findUnique({ where: { userId: session.userId }, select: { uiPreferences: true } });
  return NextResponse.json(asPrefs(setting?.uiPreferences));
}

/** Merge `{key: value}` into the saved choices; a null value removes the key. */
export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That preference can’t be saved.' }, { status: 400 });

  const setting = await db.setting.findUnique({ where: { userId: session.userId }, select: { uiPreferences: true } });
  const next: Prefs = { ...asPrefs(setting?.uiPreferences) };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length > MAX_KEYS) return NextResponse.json({ error: 'Too many saved preferences.' }, { status: 400 });

  await db.setting.upsert({
    where: { userId: session.userId },
    update: { uiPreferences: next },
    create: { userId: session.userId, uiPreferences: next },
  });
  return NextResponse.json(next);
}
