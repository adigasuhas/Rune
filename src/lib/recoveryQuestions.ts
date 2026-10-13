/**
 * The recovery questions offered at sign-up. Client-safe (no crypto) so the
 * sign-up and Settings forms can import it; the hashing side lives in
 * recovery.ts. Answers are stored against the id, so editing a question's
 * wording is safe - removing or renaming an id is not.
 */
export interface RecoveryQuestion {
  id: string;
  text: string;
  /** The playful ones - grouped separately in the picker. */
  playful?: boolean;
}

export const RECOVERY_QUESTIONS: readonly RecoveryQuestion[] = [
  { id: 'first-school', text: 'What was the name of your first school?' },
  { id: 'first-pet', text: 'What was your first pet’s name?' },
  { id: 'birth-city', text: 'What city were you born in?' },
  { id: 'childhood-street', text: 'What street did you grow up on?' },
  { id: 'deadline-snack', text: 'What snack powered your last deadline?', playful: true },
  { id: 'procrastination-site', text: 'Which website do you procrastinate on most?', playful: true },
  { id: 'tomorrow-promise', text: 'What did you promise yourself you’d finish “tomorrow”?', playful: true },
  { id: 'emergency-coffee', text: 'What’s your emergency coffee order?', playful: true },
];

const BY_ID = new Map(RECOVERY_QUESTIONS.map((q) => [q.id, q]));

export function getRecoveryQuestion(id: string | null | undefined): RecoveryQuestion | null {
  return (id && BY_ID.get(id)) || null;
}

export const MIN_ANSWER_LENGTH = 2;
export const MAX_ANSWER_LENGTH = 200;
