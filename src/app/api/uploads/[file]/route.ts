import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { readLocalUpload, mimeForStoredName, ownerTagFor } from '@/lib/storage';
import { db } from '@/lib/db';

/**
 * Serves a locally-stored notebook image.
 *
 * Uploads no longer live under `public/` (where they were world-readable and
 * served as whatever type their extension implied). They are:
 *  - reachable only with a valid session,
 *  - forced to an image content type with `X-Content-Type-Options: nosniff`
 *    and `Content-Disposition: inline` so a stored file can never execute,
 *  - named with an unguessable 24-hex token.
 *
 * Access: the uploader always. Otherwise, only someone who shares a team or a
 * project-collaboration with the uploader (the stored filename carries an
 * 8-hex hash of the uploader's id, matched here without a DB lookup for the
 * common case). A signed-in stranger cannot read another user's uploads.
 */
async function canAccessUpload(file: string, viewerId: string): Promise<boolean> {
  const tag = file.split('_')[0];
  if (tag === ownerTagFor(viewerId)) return true;

  try {
    // People the viewer legitimately shares content with: co-members of any
    // team, and anyone they collaborate with on a project (either direction).
    const [myMemberships, myCollabs] = await Promise.all([
      db.teamMembership.findMany({ where: { userId: viewerId } }),
      db.projectCollaborator.findMany({ where: { userId: viewerId } }),
    ]);
    const teamIds = myMemberships.map((m: { teamId: string }) => m.teamId);
    const relatedUserIds = new Set<string>();

    for (const teamId of teamIds) {
      const members = await db.teamMembership.findMany({ where: { teamId } });
      for (const m of members) relatedUserIds.add(m.userId);
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (team?.ownerId) relatedUserIds.add(team.ownerId);
    }
    for (const c of myCollabs) {
      const project = await db.project.findUnique({ where: { id: c.projectId } });
      if (project?.userId) relatedUserIds.add(project.userId);
    }

    for (const uid of relatedUserIds) {
      if (tag === ownerTagFor(uid)) return true;
    }
  } catch {
    // fail closed on lookup error
  }
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const { file } = await params;
  const data = await readLocalUpload(file);
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!(await canAccessUpload(file, session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mimeForStoredName(file),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
