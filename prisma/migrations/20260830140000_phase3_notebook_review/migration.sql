-- Phase 3: notebook page review workflow + page-anchored comments.

ALTER TABLE "NotebookPage" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "NotebookPage" ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);

CREATE INDEX "NotebookPage_reviewStatus_idx" ON "NotebookPage"("reviewStatus");

CREATE TABLE "NotebookComment" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anchorQuote" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotebookComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotebookComment_pageId_createdAt_idx" ON "NotebookComment"("pageId", "createdAt");

ALTER TABLE "NotebookComment" ADD CONSTRAINT "NotebookComment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "NotebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotebookComment" ADD CONSTRAINT "NotebookComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
