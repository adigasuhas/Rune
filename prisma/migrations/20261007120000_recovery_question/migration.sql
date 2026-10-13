-- Secret-question password recovery. The answer is stored only as a PBKDF2
-- hash of its normalised form (see src/lib/recovery.ts).
ALTER TABLE "User" ADD COLUMN "recoveryQuestion" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryAnswerHash" TEXT;
