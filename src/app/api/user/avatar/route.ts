import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const { avatarUrl } = await req.json();
    
    const updatedUser = await db.user.update({
      where: { id: session.userId },
      data: { avatarUrl: avatarUrl || null }
    });

    // Strip sensitive columns before returning
    const { passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt, ...userWithoutPassword } = updatedUser;

    return NextResponse.json({ success: true, user: userWithoutPassword });
  } catch (err) {
    console.error('Error updating avatar:', err);
    return NextResponse.json({ error: 'Couldn’t update avatar.' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const updatedUser = await db.user.update({
      where: { id: session.userId },
      data: { avatarUrl: null }
    });

    const { passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt, ...userWithoutPassword } = updatedUser;

    return NextResponse.json({ success: true, user: userWithoutPassword });
  } catch (err) {
    console.error('Error removing avatar:', err);
    return NextResponse.json({ error: 'Couldn’t remove avatar.' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
