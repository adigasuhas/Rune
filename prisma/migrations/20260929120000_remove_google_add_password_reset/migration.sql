-- Google OAuth / Google Calendar removal, plus self-service password reset.

-- LeaveSyncRecord existed only to bookkeep Google Calendar leave-day sync.
DROP TABLE "LeaveSyncRecord";

-- CalendarEvent: drop the Google sync columns and their index.
DROP INDEX "CalendarEvent_userId_googleEventId_idx";
ALTER TABLE "CalendarEvent" DROP COLUMN "googleEventId";
ALTER TABLE "CalendarEvent" DROP COLUMN "googleSyncedAt";
CREATE INDEX "CalendarEvent_userId_idx" ON "CalendarEvent"("userId");

-- User: drop every Google OAuth / Calendar column.
DROP INDEX "User_googleId_key";
ALTER TABLE "User" DROP COLUMN "googleId";
ALTER TABLE "User" DROP COLUMN "googleCalendarConnected";
ALTER TABLE "User" DROP COLUMN "googleCalendarAccessToken";
ALTER TABLE "User" DROP COLUMN "googleCalendarRefreshToken";
ALTER TABLE "User" DROP COLUMN "googleCalendarTokenExpiresAt";
ALTER TABLE "User" DROP COLUMN "googleCalendarSyncedAt";

-- User: add self-service password-reset token fields.
ALTER TABLE "User" ADD COLUMN "passwordResetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_passwordResetTokenHash_key" ON "User"("passwordResetTokenHash");
