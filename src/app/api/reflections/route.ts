import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The caller's completion reflections, newest first. `?projectId=` narrows to one project's tasks. */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get('projectId');
  const reflections = await db.taskReflection.findMany({
    where: { userId: session.userId, ...(projectId ? { task: { projectId } } : {}) },
    orderBy: { completedOn: 'desc' },
  });
  return NextResponse.json(reflections);
}
