import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { WallNoteSize } from '@/lib/colors';

const VALID_SIZES: WallNoteSize[] = ['SMALL', 'MEDIUM', 'LARGE'];

const updateSchema = z.object({
  text: z.string().max(10_000).optional(),
  color: z.string().max(32).optional(),
  size: z.string().max(20).optional(),
  x: z.union([z.string(), z.number()]).optional(),
  y: z.union([z.string(), z.number()]).optional(),
  bringToFront: z.boolean().optional(),
});

async function getOwnedNote(projectId: string, noteId: string, userId: string) {
  const note = await db.wallNote.findUnique({ where: { id: noteId } });
  if (!note || note.projectId !== projectId || note.userId !== userId) return null;
  return note;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, noteId } = await params;
    const note = await getOwnedNote(id, noteId, session.userId);
    if (!note) {
      return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { text, color, size, x, y, bringToFront } = parsed.data;
    const updateData: any = {};
    if (text !== undefined) updateData.text = text;
    if (color !== undefined) updateData.color = color;
    if (size !== undefined && VALID_SIZES.includes(size as WallNoteSize)) updateData.size = size;
    if (x !== undefined) updateData.x = Number(x);
    if (y !== undefined) updateData.y = Number(y);

    if (bringToFront) {
      const siblings = await db.wallNote.findMany({ where: { projectId: id } });
      const maxZ = siblings.reduce((max: number, n: any) => Math.max(max, n.zIndex), 0);
      if (note.zIndex <= maxZ) {
        updateData.zIndex = maxZ + 1;
      }
    }

    const updated = await db.wallNote.update({ where: { id: noteId }, data: updateData });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating wall note:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id, noteId } = await params;
    const note = await getOwnedNote(id, noteId, session.userId);
    if (!note) {
      return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
    }

    await db.wallNote.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting wall note:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
