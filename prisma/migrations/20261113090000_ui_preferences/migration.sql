-- Per-person UI choices (e.g. which Analytics sections are expanded).
ALTER TABLE "Setting" ADD COLUMN "uiPreferences" JSONB;

-- Rollback (by hand): ALTER TABLE "Setting" DROP COLUMN "uiPreferences";
