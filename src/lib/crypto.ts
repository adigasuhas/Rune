import crypto from 'crypto';

const CURRENT_ITERATIONS = 210_000; // OWASP-current minimum for PBKDF2-SHA512
const LEGACY_ITERATIONS = 1000; // pre-hardening hashes, format "salt:hash" (no iteration count)
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

/**
 * Hashes a plain text password using PBKDF2. Stored as "iterations:salt:hash"
 * so the iteration count travels with the hash - verifyPassword can raise
 * CURRENT_ITERATIONS later without invalidating hashes written under a lower
 * count (see needsRehash for the lazy-upgrade path).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${CURRENT_ITERATIONS}:${salt}:${hash}`;
}

/**
 * Verifies a plain text password against a stored PBKDF2 hash. Accepts both
 * the current "iterations:salt:hash" format and the legacy 2-part
 * "salt:hash" format (implicitly LEGACY_ITERATIONS), so existing accounts
 * keep working across the iteration-count bump without a mass migration.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  let iterations: number;
  let salt: string;
  let hash: string;

  if (parts.length === 3) {
    [iterations, salt, hash] = [Number(parts[0]), parts[1], parts[2]];
  } else if (parts.length === 2) {
    iterations = LEGACY_ITERATIONS;
    [salt, hash] = parts;
  } else {
    return false;
  }
  if (!salt || !hash || !Number.isFinite(iterations)) return false;

  const verifyHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
  const verifyBuf = Buffer.from(verifyHash, 'hex');
  const storedBuf = Buffer.from(hash, 'hex');
  // timingSafeEqual throws on a length mismatch rather than returning false;
  // a length mismatch here already means "not a match" with no timing signal
  // worth protecting (the attacker doesn't control the stored hash's length).
  if (verifyBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(verifyBuf, storedBuf);
}

/** True if a stored hash predates the current iteration count and should be re-hashed on next successful login. */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3) return true;
  return Number(parts[0]) < CURRENT_ITERATIONS;
}
