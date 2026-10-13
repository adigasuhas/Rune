/**
 * Deployment-level sign-in configuration: who may create an account, and
 * what counts as an acceptable password.
 *
 * Rune's sign-in is email + password only, which needs nothing outside the
 * app - no external OAuth provider to configure.
 */

// ---------------------------------------------------------------------------
// Sign-up policy
// ---------------------------------------------------------------------------

export type SignupMode = 'open' | 'domains' | 'closed';

export interface SignupPolicy {
  mode: SignupMode;
  domains: string[];
  /** Set when RUNE_SIGNUP_MODE held an unrecognised value (treated as closed). */
  invalidMode?: string;
}

/**
 * RUNE_SIGNUP_MODE:
 *   open    - anyone can create an account (the default)
 *   domains - only emails at RUNE_ALLOWED_EMAIL_DOMAINS (comma-separated)
 *   closed  - no self-service sign-up; an administrator creates accounts
 * A typo or an empty domain list fails CLOSED, never open. Existing accounts
 * are never affected by the policy - it only gates creating new ones.
 */
export function getSignupPolicy(): SignupPolicy {
  const raw = (process.env.RUNE_SIGNUP_MODE ?? '').trim().toLowerCase();
  const domains = (process.env.RUNE_ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

  if (raw === '' || raw === 'open') return { mode: 'open', domains };
  if (raw === 'closed') return { mode: 'closed', domains };
  if (raw === 'domains') return domains.length ? { mode: 'domains', domains } : { mode: 'closed', domains };
  return { mode: 'closed', domains, invalidMode: raw };
}

/** Addresses in RUNE_ADMIN_EMAILS (comma-separated, lower-cased). */
export function adminEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.RUNE_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export type SignupDecision =
  | { allowed: true }
  | { allowed: false; reason: 'closed' | 'domain'; message: string };

export function checkSignupAllowed(email: string, policy: SignupPolicy = getSignupPolicy()): SignupDecision {
  if (policy.mode === 'open') return { allowed: true };
  // An address the operator listed as an administrator may always create its
  // own account. This is how the first admin gets in on a host with no shell
  // (Docker, Vercel, Netlify) when sign-ups are otherwise closed.
  if (adminEmailAllowlist().has(email.trim().toLowerCase())) return { allowed: true };
  if (policy.mode === 'closed') {
    return {
      allowed: false,
      reason: 'closed',
      message: 'Sign-ups are closed on this deployment. Ask the administrator to create an account for you.',
    };
  }
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  if (policy.domains.includes(domain)) return { allowed: true };
  return {
    allowed: false,
    reason: 'domain',
    message: `Sign-up is limited to approved email domains (${policy.domains.map((d) => '@' + d).join(', ')}).`,
  };
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 300;

// A deliberately small blocklist of the passwords that get tried first. A
// length rule alone lets "password123" through; this is the cheap 80% of a
// breached-password check without a network dependency.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', '1234567890', '12345678910',
  'qwertyuiop', 'qwerty12345', 'qwerty123456', 'iloveyou123', 'letmein1234', 'welcome1234',
  'admin12345', 'administrator', 'changeme123', 'abcdefghij', 'abcd123456', '0123456789', '1q2w3e4r5t',
  'passw0rd123', 'trustno1234', 'baseball123', 'football123', 'monkey12345', 'dragon12345',
  // The built-in developer account's public default (src/lib/devAccount.ts).
  'developer12345',
]);

/** Returns an error message, or null if the password is acceptable. */
export function validatePassword(password: string, email?: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'That password is too common. Choose something less guessable.';
  if (email && lower === email.trim().toLowerCase()) return 'Your password can’t be the same as your email.';
  if (/^(.)\1+$/.test(password)) return 'Password can’t be a single repeated character.';
  return null;
}
