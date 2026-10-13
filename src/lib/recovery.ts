/**
 * Secret-question password recovery.
 *
 * Rune has no mandatory mail server (a self-hosted install may not have
 * one), so the self-service way back into an account is a recovery question
 * chosen at sign-up. The answer is treated like a password: normalised, then
 * PBKDF2-hashed with the same parameters as passwords (crypto.ts). Its plain
 * text is never stored, logged, or returned by any API.
 *
 * The question list itself is in recoveryQuestions.ts (client-safe).
 */
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './crypto';
import { RECOVERY_QUESTIONS, MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH, getRecoveryQuestion, type RecoveryQuestion } from './recoveryQuestions';

export { RECOVERY_QUESTIONS, getRecoveryQuestion, type RecoveryQuestion };

/**
 * Case, accents, punctuation and spacing shouldn't decide whether you get
 * your account back: "St. Mary's", "st marys" and "ST  MARY'S " all match.
 * Letters and digits from any script are kept.
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining accents (é -> e)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Returns an error message, or null if the answer is usable. */
export function validateAnswer(answer: string, email?: string): string | null {
  if (typeof answer !== 'string') return 'Enter an answer to your recovery question.';
  if (answer.length > MAX_ANSWER_LENGTH) return `Keep the answer under ${MAX_ANSWER_LENGTH} characters.`;
  const norm = normalizeAnswer(answer);
  if (norm.length < MIN_ANSWER_LENGTH) return 'That answer is too short to protect your account.';
  if (email && norm === normalizeAnswer(email)) return 'Your answer can’t be your email address.';
  return null;
}

export function hashAnswer(answer: string): string {
  return hashPassword(normalizeAnswer(answer));
}

export function verifyAnswer(answer: string, storedHash: string): boolean {
  return verifyPassword(normalizeAnswer(answer), storedHash);
}

/**
 * The question shown for an email that has no account (or no question set).
 * Derived from a keyed hash of the address so it is stable across requests -
 * asking twice for the same unknown email shows the same question, so the
 * response can't be used to tell real accounts from made-up ones.
 */
export function decoyQuestionFor(email: string): RecoveryQuestion {
  const key = process.env.JWT_SECRET || 'rune-recovery-decoy';
  const digest = crypto.createHmac('sha256', key).update(email.trim().toLowerCase()).digest();
  return RECOVERY_QUESTIONS[digest.readUInt32BE(0) % RECOVERY_QUESTIONS.length];
}

/** Compared against when there's no real answer, so a miss costs the same PBKDF2 time as a wrong answer. */
export const DUMMY_ANSWER_HASH = hashPassword('rune-recovery-timing-equaliser');
