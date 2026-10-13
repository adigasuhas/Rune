import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { WallNoteSize } from '@/lib/colors';

const VALID_SIZES: WallNoteSize[] = ['SMALL', 'MEDIUM', 'LARGE'];

const createSchema = z.object({
  text: z.string().max(10_000).optional(),
  color: z.string().max(32).optional(),
  size: z.string().max(20).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.userId) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  const notes = await db.wallNote.findMany({ where: { projectId: id } });
  return NextResponse.json(notes);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project || project.userId !== session.userId) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
    }
    const { text, color, size, x, y } = parsed.data;
    const finalSize: WallNoteSize = VALID_SIZES.includes(size as WallNoteSize) ? (size as WallNoteSize) : 'MEDIUM';

    // Stack new notes at the top so they're immediately visible/interactable,
    // rather than tucked behind whatever's already on the board.
    const existing = await db.wallNote.findMany({ where: { projectId: id } });
    const maxZ = existing.reduce((max: number, n: any) => Math.max(max, n.zIndex), 0);

    const note = await db.wallNote.create({
      data: {
        projectId: id,
        userId: session.userId,
        text: text || '',
        color: color || '#FDE68A',
        size: finalSize,
        x: typeof x === 'number' ? x : 40,
        y: typeof y === 'number' ? y : 40,
        zIndex: maxZ + 1
      }
    });

    return NextResponse.json(note);
  } catch (err) {
    console.error('Error creating wall note:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
