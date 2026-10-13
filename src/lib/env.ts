/**
 * Environment validation.
 *
 * Previously a missing JWT_SECRET only surfaced as a 500 the first time
 * someone tried to sign in. `assertProductionEnv()` runs once at server
 * start (from instrumentation.ts) and refuses to boot a production
 * deployment that is misconfigured, with a message that says exactly what
 * is missing.
 *
 * Sign-in is email + password only and needs nothing external. SMTP is
 * optional: if configured, "forgot password" emails a reset link; if not,
 * the link is written to the server console for an administrator to relay.
 *
 * In development only DATABASE_URL is required (JWT_SECRET is warned about).
 */

import { getSignupPolicy } from './authConfig';
import { configuredBaseUrl } from './baseUrl';

const WEAK_SECRETS = new Set([
  'changeme', 'secret', 'dev', 'development', 'test', 'password',
  'your-secret-here', 'replace-me',
]);

export interface EnvReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function checkEnv(): EnvReport {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const jwt = process.env.JWT_SECRET;

  // Postgres is required in every environment now (local dev runs it via
  // `npm run dev:db`). The old JSON-file fallback is gone.
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required. For local development run `npm run dev:db` (a zero-install Postgres). See DEPLOY.md.');
  }

  if (isProd) {
    if (!jwt) errors.push('JWT_SECRET is required in production. Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
    else if (jwt.length < 32) errors.push('JWT_SECRET must be at least 32 characters.');
    else if (WEAK_SECRETS.has(jwt.toLowerCase())) errors.push('JWT_SECRET is a well-known placeholder value. Use a real random secret.');

    if (!process.env.SMTP_HOST) {
      warnings.push('SMTP is not configured - "forgot password" reset links will be written to the server console instead of emailed. Set SMTP_HOST/SMTP_PORT/SMTP_FROM to email them instead.');
    }

    const base = configuredBaseUrl();
    if (!base) {
      warnings.push('RUNE_BASE_URL is not set. Redirects and password-reset links will use whatever host the request arrives with, which is wrong behind a reverse proxy or container. Set it to your public URL (e.g. https://rune.example.com).');
    } else if (base.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
      warnings.push('RUNE_BASE_URL uses plain http on a non-local host. Sign-in cookies and passwords will travel unencrypted; use https.');
    }

    if (getSignupPolicy().mode === 'open' && !process.env.RUNE_SIGNUP_MODE) {
      warnings.push('RUNE_SIGNUP_MODE is not set, so anyone who can reach this site can create an account. Set RUNE_SIGNUP_MODE=closed (admin creates accounts) or =domains with RUNE_ALLOWED_EMAIL_DOMAINS for a team.');
    }

    const uploadsToDisk = !process.env.S3_BUCKET;
    if (uploadsToDisk && !process.env.RUNE_DATA_DIR && !process.env.RUNE_UPLOAD_DIR) {
      warnings.push('No S3_* or RUNE_DATA_DIR configured - uploads and the audit log write to ./data, which must be a PERSISTENT disk (not an ephemeral serverless filesystem).');
    }
  } else {
    if (!jwt) warnings.push('JWT_SECRET is unset. Sign-in will fail until you set it (see .env.example).');
  }

  // Typos in the deployment settings: an error in production (a silently
  // ignored RUNE_BASE_URL or a mistyped sign-up mode is exactly the kind of
  // thing that should stop a deploy), just a heads-up in development.
  const misconfig = isProd ? errors : warnings;
  if (process.env.RUNE_BASE_URL?.trim() && !configuredBaseUrl()) {
    misconfig.push('RUNE_BASE_URL is not a valid http(s) URL. Use the form https://rune.example.com or http://localhost:3000.');
  }
  const policy = getSignupPolicy();
  if (policy.invalidMode) {
    misconfig.push(`RUNE_SIGNUP_MODE="${policy.invalidMode}" is not valid (use open, domains or closed). Sign-ups are treated as CLOSED until it is fixed.`);
  } else if (process.env.RUNE_SIGNUP_MODE?.trim().toLowerCase() === 'domains' && policy.mode === 'closed') {
    warnings.push('RUNE_SIGNUP_MODE=domains but RUNE_ALLOWED_EMAIL_DOMAINS is empty, so sign-ups are CLOSED.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Throws in production if the environment is not viable; logs warnings always. */
export function assertProductionEnv(): void {
  const { ok, errors, warnings } = checkEnv();
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (!ok) {
    console.error('\n[env] Refusing to start - fix the following and redeploy:\n');
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('');
    throw new Error(`Invalid environment: ${errors.length} problem(s). See the log above / DEPLOY.md.`);
  }
}
