-- Review the Day: keep both answers verbatim, the working day the first
-- focus is for, and (separately) when its Today reminder was acknowledged.
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "wentWell" TEXT;
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "firstFocus" TEXT;
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "firstFocusDate" TEXT;
ALTER TABLE "AccomplishmentRecord" ADD COLUMN "firstFocusTaskId" TEXT;

-- Existing rows were all written by Review the Day (its only writer), so
-- they are reviews: date them from createdAt. keyAchievements held the
-- "went well" answer, or a generated stand-in when it was left blank
-- ("Completed N task(s)." / "Reviewed the day.") - copy only real answers.
UPDATE "AccomplishmentRecord" SET "reviewedAt" = "createdAt", "updatedAt" = "createdAt";
UPDATE "AccomplishmentRecord" SET "wentWell" = "keyAchievements"
WHERE "keyAchievements" IS NOT NULL
  AND btrim("keyAchievements") <> ''
  AND "keyAchievements" <> 'Reviewed the day.'
  AND "keyAchievements" !~ '^Completed [0-9]+ tasks?\.$';

CREATE INDEX "AccomplishmentRecord_userId_firstFocusDate_idx" ON "AccomplishmentRecord"("userId", "firstFocusDate");

CREATE TABLE "FirstFocusAck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "focusDate" TEXT NOT NULL,
    "reviewDate" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirstFocusAck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FirstFocusAck_userId_focusDate_key" ON "FirstFocusAck"("userId", "focusDate");
ALTER TABLE "FirstFocusAck" ADD CONSTRAINT "FirstFocusAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
