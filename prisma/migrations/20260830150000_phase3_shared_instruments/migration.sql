-- Phase 3: opt-in team sharing for instruments.
ALTER TABLE "Instrument" ADD COLUMN "teamId" TEXT;
CREATE INDEX "Instrument_teamId_idx" ON "Instrument"("teamId");
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
