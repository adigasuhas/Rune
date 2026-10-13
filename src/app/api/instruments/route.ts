import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const numericish = z.union([z.string(), z.number()]).nullable().optional();

const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(100),
  teamId: z.string().max(200).nullable().optional(),
  ram: z.string().max(100).nullable().optional(),
  cpuArch: z.string().max(100).nullable().optional(),
  nodes: numericish,
  coresPerNode: numericish,
  gpuNodes: numericish,
  gpusPerNode: numericish,
  gpuModel: z.string().max(200).nullable().optional(),
  gpuMemory: z.string().max(100).nullable().optional(),
  hardwareSpecs: z.string().max(5000).nullable().optional(),
  runtimeType: z.string().max(50).optional(),
  maxRuntime: z.string().max(100).nullable().optional(),
  slots: z.array(z.unknown()).optional(),
  isFavorite: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  isFavorite: z.boolean().optional(),
  name: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  teamId: z.string().max(200).nullable().optional(),
  ram: z.string().max(100).nullable().optional(),
  cpuArch: z.string().max(100).nullable().optional(),
  nodes: numericish,
  coresPerNode: numericish,
  gpuNodes: numericish,
  gpusPerNode: numericish,
  gpuModel: z.string().max(200).nullable().optional(),
  gpuMemory: z.string().max(100).nullable().optional(),
  hardwareSpecs: z.string().max(5000).nullable().optional(),
  runtimeType: z.string().max(50).optional(),
  maxRuntime: z.string().max(100).nullable().optional(),
  slots: z.array(z.unknown()).optional(),
});

/** Team ids the caller belongs to. */
async function myTeamIds(userId: string): Promise<string[]> {
  const m = await db.teamMembership.findMany({ where: { userId } });
  return m.map((x: any) => x.teamId as string);
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const teamIds = await myTeamIds(session.userId);
  const [own, shared] = await Promise.all([
    db.instrument.findMany({ where: { userId: session.userId } }),
    teamIds.length ? db.instrument.findMany({ where: { teamId: { in: teamIds }, NOT: { userId: session.userId } } }) : Promise.resolve([])
  ]);

  const teamNames = teamIds.length ? await db.team.findMany({ where: { id: { in: teamIds } } }) : [];
  const teamNameById = new Map((teamNames as any[]).map(t => [t.id as string, t.name as string]));

  const mark = (i: any, mine: boolean) => ({
    ...i,
    canEdit: mine,
    sharedFrom: i.teamId ? (teamNameById.get(i.teamId) || 'team') : null
  });

  return NextResponse.json([
    ...(own as any[]).map(i => mark(i, true)),
    ...(shared as any[]).map(i => mark(i, false))
  ]);
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
    // Sharing to a team is only allowed if the caller is in that team.
    let teamId: string | null = null;
    if (data.teamId) {
      const teamIds = await myTeamIds(session.userId);
      teamId = teamIds.includes(data.teamId) ? data.teamId : null;
    }

    const item = await db.instrument.create({
      data: {
        name: data.name,
        category: data.category,
        teamId,
        ram: data.ram || null,
        cpuArch: data.cpuArch || null,
        nodes: data.nodes ? Number(data.nodes) : null,
        coresPerNode: data.coresPerNode ? Number(data.coresPerNode) : null,
        gpuNodes: data.gpuNodes ? Number(data.gpuNodes) : null,
        gpusPerNode: data.gpusPerNode ? Number(data.gpusPerNode) : null,
        gpuModel: data.gpuModel || null,
        gpuMemory: data.gpuMemory || null,
        hardwareSpecs: data.hardwareSpecs || null,
        runtimeType: data.runtimeType || 'fixed',
        maxRuntime: data.maxRuntime || null,
        slots: data.slots || [],
        isFavorite: data.isFavorite === true,
        userId: session.userId
      }
    });

    return NextResponse.json(item);
  } catch (err) {
    console.error('Error creating instrument:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, isFavorite, ...rest } = parsed.data;

  try {
    const existing = await db.instrument.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.userId) {
      return NextResponse.json({ error: 'Instrument not found.' }, { status: 404 });
    }

    const updateData: any = {};
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite === true;
    if (rest.name !== undefined) updateData.name = rest.name;
    if (rest.category !== undefined) updateData.category = rest.category;
    if (rest.ram !== undefined) updateData.ram = rest.ram;
    if (rest.cpuArch !== undefined) updateData.cpuArch = rest.cpuArch;
    if (rest.nodes !== undefined) updateData.nodes = rest.nodes ? Number(rest.nodes) : null;
    if (rest.coresPerNode !== undefined) updateData.coresPerNode = rest.coresPerNode ? Number(rest.coresPerNode) : null;
    if (rest.gpuNodes !== undefined) updateData.gpuNodes = rest.gpuNodes ? Number(rest.gpuNodes) : null;
    if (rest.gpusPerNode !== undefined) updateData.gpusPerNode = rest.gpusPerNode ? Number(rest.gpusPerNode) : null;
    if (rest.gpuModel !== undefined) updateData.gpuModel = rest.gpuModel;
    if (rest.gpuMemory !== undefined) updateData.gpuMemory = rest.gpuMemory;
    if (rest.hardwareSpecs !== undefined) updateData.hardwareSpecs = rest.hardwareSpecs;
    if (rest.runtimeType !== undefined) updateData.runtimeType = rest.runtimeType;
    if (rest.maxRuntime !== undefined) updateData.maxRuntime = rest.maxRuntime;
    if (rest.slots !== undefined) updateData.slots = rest.slots;
    if (rest.teamId !== undefined) {
      if (!rest.teamId) {
        updateData.teamId = null;
      } else {
        const teamIds = await myTeamIds(session.userId);
        updateData.teamId = teamIds.includes(rest.teamId) ? rest.teamId : null;
      }
    }

    const updated = await db.instrument.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating instrument:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Instrument ID is required.' }, { status: 400 });
    }

    const existing = await db.instrument.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.userId) {
      return NextResponse.json({ error: 'Instrument not found.' }, { status: 404 });
    }

    await db.instrument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting instrument:', err);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
