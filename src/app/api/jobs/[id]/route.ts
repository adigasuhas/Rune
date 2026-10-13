import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LinkError, resolveOwnedNotebookPageId, resolveOwnedTaskId, resolveUsableInstrumentId } from '@/lib/jobLinks';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  taskId: z.string().max(200).nullable().optional(),
  category: z.string().max(100).optional(),
  instrumentId: z.string().max(200).nullable().optional(),
  notebookPageId: z.string().max(200).nullable().optional(),
  isCpu: z.boolean().optional(),
  isGpu: z.boolean().optional(),
  queue: z.string().max(200).nullable().optional(),
  status: z.string().max(50).optional(),
  jobId: z.string().max(200).nullable().optional(),
  submitTime: z.string().max(60).nullable().optional(),
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id }
  });

  if (!job || job.userId !== session.userId) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id }
  });

  if (!job || job.userId !== session.userId) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    // Re-check a link only when it changes, so an untouched link (say, an
    // instrument from a team the user has since left) doesn't block edits.
    if (data.taskId !== undefined && (data.taskId || null) !== job.taskId) {
      updateData.taskId = await resolveOwnedTaskId(data.taskId, session.userId);
    }
    if (data.category !== undefined) updateData.category = data.category;
    if (data.instrumentId !== undefined && (data.instrumentId || null) !== job.instrumentId) {
      updateData.instrumentId = await resolveUsableInstrumentId(data.instrumentId, session.userId);
    }
    if (data.notebookPageId !== undefined) {
      updateData.notebookPageId = await resolveOwnedNotebookPageId(data.notebookPageId, session.userId);
    }
    if (data.isCpu !== undefined) updateData.isCpu = data.isCpu === true;
    if (data.isGpu !== undefined) updateData.isGpu = data.isGpu === true;
    if (data.queue !== undefined) updateData.queue = data.queue;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.jobId !== undefined) updateData.jobId = data.jobId;
    if (data.submitTime !== undefined) updateData.submitTime = data.submitTime ? new Date(data.submitTime) : undefined;
    if (data.projectedStartTime !== undefined) updateData.projectedStartTime = data.projectedStartTime ? new Date(data.projectedStartTime) : null;
    if (data.projectedCompletionTime !== undefined) updateData.projectedCompletionTime = data.projectedCompletionTime ? new Date(data.projectedCompletionTime) : null;
    if (data.computeTime !== undefined) updateData.computeTime = Number(data.computeTime);
    if (data.inputFile !== undefined) updateData.inputFile = data.inputFile;
    if (data.workingDirectory !== undefined) updateData.workingDirectory = data.workingDirectory;
    if (data.sampleName !== undefined) updateData.sampleName = data.sampleName;
    if (data.sampleId !== undefined) updateData.sampleId = data.sampleId;
    if (data.reminders !== undefined) updateData.reminders = data.reminders;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.actualEndTime !== undefined) updateData.actualEndTime = data.actualEndTime ? new Date(data.actualEndTime) : null;
    if (data.attempts !== undefined) updateData.attempts = data.attempts;

    const updated = await db.job.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof LinkError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Error updating job:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id }
  });

  if (!job || job.userId !== session.userId) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  try {
    await db.job.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting job:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
