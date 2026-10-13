-- Phase 6: collapse each notebook to a single continuous LaTeX document.
-- Sections are now `\section{}` headings written inside that one document,
-- not separate SubNotebook/NotebookPage rows - matches a real Overleaf-
-- style project (one file, organized by headings), not a per-section CMS.

-- Preserve existing content: merge every notebook's pages (in their
-- current section/page order) into its first page, each former page's
-- content prefixed with a `\section{<its title>}` heading so nothing is
-- silently lost or unlabeled. Reassign attachments/comments/linked runs
-- from the pages being removed to the surviving page first.

CREATE TEMP TABLE notebook_keepers AS
SELECT DISTINCT ON (p."notebookId") p."notebookId", p.id AS keeper_id
FROM "NotebookPage" p
LEFT JOIN "SubNotebook" sn ON sn.id = p."subNotebookId"
ORDER BY p."notebookId", COALESCE(sn."order", 999998), p."order";

CREATE TEMP TABLE notebook_merged AS
SELECT op."notebookId",
  string_agg('\section{' || op.title || '}' || E'\n\n' || op.content, E'\n\n' ORDER BY op.rn) AS merged_content
FROM (
  SELECT
    p."notebookId", p.title, p.content,
    ROW_NUMBER() OVER (PARTITION BY p."notebookId" ORDER BY COALESCE(sn."order", 999998), p."order") AS rn
  FROM "NotebookPage" p
  LEFT JOIN "SubNotebook" sn ON sn.id = p."subNotebookId"
) op
GROUP BY op."notebookId";

UPDATE "NotebookAttachment" a
SET "pageId" = k.keeper_id
FROM "NotebookPage" p
JOIN notebook_keepers k ON k."notebookId" = p."notebookId"
WHERE a."pageId" = p.id AND p.id <> k.keeper_id;

UPDATE "NotebookComment" c
SET "pageId" = k.keeper_id
FROM "NotebookPage" p
JOIN notebook_keepers k ON k."notebookId" = p."notebookId"
WHERE c."pageId" = p.id AND p.id <> k.keeper_id;

UPDATE "Job" j
SET "notebookPageId" = k.keeper_id
FROM "NotebookPage" p
JOIN notebook_keepers k ON k."notebookId" = p."notebookId"
WHERE j."notebookPageId" = p.id AND p.id <> k.keeper_id;

UPDATE "NotebookPage" p
SET content = m.merged_content, title = 'Notebook'
FROM notebook_merged m
WHERE p.id = (SELECT keeper_id FROM notebook_keepers WHERE "notebookId" = m."notebookId");

DELETE FROM "NotebookPage" p
USING notebook_keepers k
WHERE p."notebookId" = k."notebookId" AND p.id <> k.keeper_id;

DROP TABLE notebook_keepers;
DROP TABLE notebook_merged;

-- AlterTable: drop the now-unused section-grouping column/table and
-- enforce exactly one page per notebook going forward.
ALTER TABLE "NotebookPage" DROP COLUMN "subNotebookId";
DROP TABLE "SubNotebook";
ALTER TABLE "NotebookPage" ADD CONSTRAINT "NotebookPage_notebookId_key" UNIQUE ("notebookId");

-- CreateTable: lightweight version history, snapshotted on manual save
-- (not every autosave tick) - one revision stream per document instead of
-- per-page, matching the simpler one-document-per-notebook model.
CREATE TABLE "NotebookRevision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotebookRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotebookRevision_pageId_createdAt_idx" ON "NotebookRevision"("pageId", "createdAt");

ALTER TABLE "NotebookRevision" ADD CONSTRAINT "NotebookRevision_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotebookRevision" ADD CONSTRAINT "NotebookRevision_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
