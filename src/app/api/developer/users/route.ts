import { NextRequest, NextResponse } from 'next/server';
import { validatePassword } from '@/lib/authConfig';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { requireAdmin } from '@/lib/admin';
import { recordAudit } from '@/lib/audit';
import { invalidateSessionCache } from '@/lib/auth';

const ROLES = ['USER', 'DEVELOPER'] as const;
const STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  timezone: z.string().max(64).optional(),
  role: z.enum(ROLES).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(STATUSES).optional(),
  timezone: z.string().max(64).optional(),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get('search')?.trim() || '';
    const roleFilter = sp.get('role') || '';
    const statusFilter = sp.get('status') || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') || '50', 10) || 50));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    // Stats are computed with aggregate counts, never by loading full tables
    // into memory - this page must stay cheap as the user/task base grows.
    const [totalUsers, activeUsers, totalProjects, totalTasks, dailyLogins] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      db.project.count(),
      db.task.count(),
      db.user.count({ where: { lastLogin: { gte: startOfToday, lt: startOfTomorrow } } }),
    ]);
    const stats = { totalUsers, activeUsers, totalProjects, totalTasks, dailyLogins };

    const where = {
      deletedAt: null,
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const rows = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { projects: true, tasks: true } } },
    });

    const users = rows.map((u) => {
      const { passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt, _count, ...safe } = u;
      return { ...safe, totalProjects: _count.projects, totalTasks: _count.tasks };
    });

    return NextResponse.json({ users, stats, page, pageSize });
  } catch (err) {
    console.error('Error fetching developer users:', err);
    return NextResponse.json({ error: 'Couldn’t retrieve users.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, password, timezone, role } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const passwordError = validatePassword(password, normalizedEmail);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  try {
    if (await db.user.findUnique({ where: { email: normalizedEmail } })) {
      return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
    }
    const newUser = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        timezone: timezone || 'UTC',
        role: role || 'USER',
        status: 'ACTIVE',
        // No stored avatar: everyone gets a default cartoon from their id (src/lib/avatars.ts).
      },
    });
    recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'user.create', targetId: newUser.id, targetEmail: normalizedEmail, detail: { role: newUser.role } });
    const { passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt, ...safeUser } = newUser;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Error creating user:', err);
    return NextResponse.json({ error: 'Couldn’t create user.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some fields are missing or invalid.', details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, name, email, password, role, status, timezone } = parsed.data;
  if (password) {
    const passwordError = validatePassword(password, email);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  try {
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email.toLowerCase();
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (password) updateData.passwordHash = hashPassword(password);
    // Suspending/disabling an account, or changing its password, must kill
    // every existing session for that user immediately.
    if ((status !== undefined && status !== 'ACTIVE') || password) {
      updateData.sessionVersion = (target.sessionVersion ?? 0) + 1;
    }

    const updated = await db.user.update({ where: { id }, data: updateData });
    invalidateSessionCache(id); // a status/role change must take effect immediately

    const changed = Object.keys(updateData).filter((k) => k !== 'passwordHash');
    if (password) changed.push('password');
    recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: 'user.update', targetId: id, targetEmail: target.email, detail: { fields: changed, role, status } });

    const { passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt, ...safeUser } = updated;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Error updating user:', err);
    return NextResponse.json({ error: 'Couldn’t update user.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    if (!id) return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (target.id === admin.userId) {
      return NextResponse.json({ error: 'You can’t delete your own account.' }, { status: 400 });
    }

    if (permanent) {
      await db.user.delete({ where: { id } });
    } else {
      await db.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DISABLED', sessionVersion: (target.sessionVersion ?? 0) + 1 },
      });
    }
    invalidateSessionCache(id);
    recordAudit({ actorId: admin.userId, actorEmail: admin.email, action: permanent ? 'user.delete.permanent' : 'user.delete.soft', targetId: id, targetEmail: target.email });

    return NextResponse.json({ success: true, message: permanent ? 'User permanently deleted' : 'User soft-deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return NextResponse.json({ error: 'Couldn’t delete user.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
