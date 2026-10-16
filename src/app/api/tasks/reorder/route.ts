import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({
  orders: z
    .array(z.object({ id: z.string().min(1).max(200), manualOrder: z.number().finite() }))
    .min(1)
    .max(500),
});

/**
 * Saves the caller's own To do arrangement (Task.manualOrder). Writes only
 * that one column, only on tasks the caller owns - it's their personal
 * display order, so it never changes priority, dates, status or anything a
 * teammate sees as data. Deliberately not routed through PUT /api/tasks/[id]
 * (and not `db.task.update`): that path re-syncs calendar slots and
 * recomputes time, none of which a reorder should touch.
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.' }, { status: 400 });
  }

  let updated = 0;
  for (const { id, manualOrder } of parsed.data.orders) {
    const res = await db.task.updateMany({ where: { id, userId: session.userId }, data: { manualOrder } });
    updated += res.count;
  }
  return NextResponse.json({ updated });
}
