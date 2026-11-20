-- A notebook's document format: "standard", or "minutes" (minutes of meeting:
-- unnumbered headings, each meeting on a new page). Existing notebooks stay standard.
ALTER TABLE "Notebook" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'standard';

-- Rollback (by hand): ALTER TABLE "Notebook" DROP COLUMN "layout";
