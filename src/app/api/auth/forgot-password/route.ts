import { NextRequest, NextResponse } from 'next/server';
import { DEVELOPER_EMAIL } from '@/lib/devAccount';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rateLimit';
import { issuePasswordResetToken } from '@/lib/passwordReset';
import { isSmtpConfigured, sendMail } from '@/lib/mailer';
import { absoluteUrl } from '@/lib/baseUrl';

const schema = z.object({ email: z.string().min(1).max(300) });

/**
 * Always returns the same generic response, whether or not the email is
 * registered - this endpoint must never let a caller enumerate accounts.
 * The response text varies only on deployment-wide SMTP configuration
 * (public information), never on whether the particular email exists.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'auth-forgot-password', 5, 15 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your email address.' }, { status: 400 });
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  const perAccount = enforceRateLimit(req, 'auth-forgot-password-email', 3, 15 * 60_000, normalizedEmail);
  if (perAccount) return perAccount;

  try {
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (user && !user.deletedAt && user.status === 'ACTIVE') {
      const token = await issuePasswordResetToken(user.id);
      const link = absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`, req).toString();
      // The built-in developer account's address is a placeholder at a domain
      // no Rune operator controls - emailing its reset link would hand admin
      // access to whoever receives mail there. Its link only goes to the log.
      const sent = user.email !== DEVELOPER_EMAIL && await sendMail({
        to: user.email,
        subject: 'Reset your Rune password',
        text: `Reset your password here:\n\n${link}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, you can ignore this email.`,
      });
      if (!sent) {
        // No SMTP configured (or the send failed) - log the link so an
        // administrator with server/console access can relay it out-of-band.
        // The feature stays available even with zero external dependencies.
        console.log(`[password-reset] Reset link for ${user.email} (expires in 1 hour): ${link}`);
      }
    }
  } catch (err) {
    console.error('Error issuing password reset token:', err);
  }

  return NextResponse.json({
    success: true,
    message: isSmtpConfigured()
      ? 'If an account exists for that email, we’ve sent a reset link. Check your inbox.'
      : 'If an account exists for that email, a reset link has been generated. Ask your administrator for it.',
  });
}
export const dynamic = 'force-dynamic';
