-- Phase 5: Notebook redesign (Project -> Notebook -> Section -> Entry).
-- Removes the forced "daily log" concept (SectionMode.DAILY) - a research
-- notebook shouldn't institutionalize a daily-update cadence; every entry
-- already carries its own optional `date`, that's the only date concept
-- that survives. Adds per-entry authorship and file attachments.

-- Preserve visual order before dropping DAILY's implicit date-sort: any
-- section that was DAILY had its pages sorted by `date` client-side and
-- never wrote a meaningful `order` (all default to 0) - assign one now so
-- nothing re-shuffles once that implicit sort goes away.
UPDATE "NotebookPage" p
SET "order" = ranked.rn
FROM (
  SELECT p2.id, ROW_NUMBER() OVER (
    PARTITION BY p2."subNotebookId"
    ORDER BY p2."date" DESC NULLS LAST, p2."createdAt" ASC
  ) AS rn
  FROM "NotebookPage" p2
  JOIN "SubNotebook" sn ON sn.id = p2."subNotebookId"
  WHERE sn."sectionMode" = 'DAILY'
) ranked
WHERE p.id = ranked.id;

-- AlterTable: drop SectionMode
ALTER TABLE "SubNotebook" DROP COLUMN "sectionMode";
DROP TYPE "SectionMode";

-- AlterTable: entry authorship
ALTER TABLE "NotebookPage" ADD COLUMN "authorId" TEXT;
ALTER TABLE "NotebookPage" ADD CONSTRAINT "NotebookPage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing entry's author defaults to its notebook's owner.
UPDATE "NotebookPage" p
SET "authorId" = n."userId"
FROM "Notebook" n
WHERE n.id = p."notebookId" AND p."authorId" IS NULL;

-- CreateTable: NotebookAttachment
CREATE TABLE "NotebookAttachment" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotebookAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotebookAttachment_pageId_idx" ON "NotebookAttachment"("pageId");

ALTER TABLE "NotebookAttachment" ADD CONSTRAINT "NotebookAttachment_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
