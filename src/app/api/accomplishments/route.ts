import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeDaySnapshot } from '@/lib/accomplishmentSnapshot';

const createSchema = z.object({
  date: z.string().min(1).max(30),
  keyAchievements: z.string().max(10_000).nullable().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const records = await db.accomplishmentRecord.findMany({
    where: { userId: session.userId }
  });
  
  return NextResponse.json(records);
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a date.' }, { status: 400 });
  }
  const { date, keyAchievements } = parsed.data;

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId }
    });
    const tz = user?.timezone || 'UTC';
    
    const snapshot = await computeDaySnapshot(session.userId, date, tz);

    const record = await db.accomplishmentRecord.upsert({
      where: {
        userId_date: {
          userId: session.userId,
          date
        }
      },
      update: {
        ...snapshot,
        keyAchievements: keyAchievements || '',
      },
      create: {
        userId: session.userId,
        date,
        ...snapshot,
        keyAchievements: keyAchievements || '',
      }
    });
    
    return NextResponse.json(record);
  } catch (err) {
    console.error('Error generating Daily Accomplishment Record:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
