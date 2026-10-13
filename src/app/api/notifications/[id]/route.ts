import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const updateSchema = z.object({
  read: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const notification = await db.notification.findUnique({ where: { id } });

  if (!notification || notification.userId !== session.userId) {
    return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const updateData: { read?: boolean; dismissedAt?: Date | null } = {};
    if (data.read !== undefined) updateData.read = data.read === true;
    if (data.dismissed !== undefined) updateData.dismissedAt = data.dismissed ? new Date() : null;

    const updated = await db.notification.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating notification:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
