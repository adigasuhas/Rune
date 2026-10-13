import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LinkError, resolveOwnedNotebookPageId, resolveOwnedTaskId, resolveUsableInstrumentId } from '@/lib/jobLinks';

const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  taskId: z.string().max(200).nullable().optional(),
  category: z.string().max(100).optional(),
  instrumentId: z.string().max(200).nullable().optional(),
  notebookPageId: z.string().max(200).nullable().optional(),
  isCpu: z.boolean().optional(),
  isGpu: z.boolean().optional(),
  queue: z.string().max(200).nullable().optional(),
  status: z.string().max(50).optional(),
  jobId: z.string().max(200).nullable().optional(),
  submitTime: z.string().max(60).optional(),
  projectedStartTime: z.string().max(60).nullable().optional(),
  projectedCompletionTime: z.string().max(60).nullable().optional(),
  computeTime: z.union([z.string(), z.number()]).optional(),
  inputFile: z.string().max(1000).nullable().optional(),
  workingDirectory: z.string().max(1000).nullable().optional(),
  sampleName: z.string().max(300).nullable().optional(),
  sampleId: z.string().max(300).nullable().optional(),
  reminders: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  actualEndTime: z.string().max(60).nullable().optional(),
  attempts: z.array(z.unknown()).optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const list = await db.job.findMany({
    where: { userId: session.userId }
  });

  // Attach the linked notebook's title (if any) for display - the page's
  // own title is a static default now (one continuous document per
  // notebook), so the notebook's own title is what's actually recognisable.
  const pageIds = Array.from(
    new Set(list.filter((j: any) => j.notebookPageId).map((j: any) => j.notebookPageId as string))
  );
  if (pageIds.length > 0) {
    const pages = await db.notebookPage.findMany({ where: { id: { in: pageIds } }, include: { notebook: { select: { title: true } } } });
    const titleById = new Map(pages.map((p: any) => [p.id as string, (p.notebook?.title || p.title) as string]));
    return NextResponse.json(
      list.map((j: any) =>
        j.notebookPageId ? { ...j, notebookPageTitle: titleById.get(j.notebookPageId) || null } : j
      )
    );
  }

  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const notebookPageId = await resolveOwnedNotebookPageId(data.notebookPageId, session.userId);
    const taskId = await resolveOwnedTaskId(data.taskId, session.userId);
    const instrumentId = await resolveUsableInstrumentId(data.instrumentId, session.userId);

    const job = await db.job.create({
      data: {
        name: data.name,
        taskId,
        category: data.category || 'General',
        instrumentId,
        notebookPageId,
        isCpu: data.isCpu !== false,
        isGpu: data.isGpu === true,
        queue: data.queue || null,
        status: data.status || 'Queued',
        jobId: data.jobId || null,
        submitTime: data.submitTime ? new Date(data.submitTime) : new Date(),
        projectedStartTime: data.projectedStartTime ? new Date(data.projectedStartTime) : null,
        projectedCompletionTime: data.projectedCompletionTime ? new Date(data.projectedCompletionTime) : null,
        computeTime: data.computeTime ? Number(data.computeTime) : 0,
        inputFile: data.inputFile || null,
        workingDirectory: data.workingDirectory || null,
        sampleName: data.sampleName || null,
        sampleId: data.sampleId || null,
        reminders: data.reminders || {},
        notes: data.notes || null,
        actualEndTime: data.actualEndTime ? new Date(data.actualEndTime) : null,
        userId: session.userId,
        attempts: data.attempts || []
      }
    });

    return NextResponse.json(job);
  } catch (err) {
    if (err instanceof LinkError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Error creating job:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
