/**
 * Optional outbound email (currently just password-reset links). If the
 * operator configures SMTP_HOST/SMTP_PORT/SMTP_FROM, reset links are emailed;
 * if not, the caller (src/app/api/auth/forgot-password/route.ts) logs the
 * link to the server console instead, so the feature never silently does
 * nothing on a deployment with no mail server.
 */
import nodemailer, { type Transporter } from 'nodemailer';

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim() && process.env.SMTP_FROM?.trim()
  );
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return cachedTransporter;
}

/** Best-effort send. Never throws - returns false on any failure (including "SMTP isn't configured") so the caller can fall back. */
export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return true;
  } catch (err) {
    console.error('[mailer] Failed to send email:', err);
    return false;
  }
}
