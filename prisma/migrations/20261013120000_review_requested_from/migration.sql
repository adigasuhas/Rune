-- "Ask for review" now goes to one chosen reviewer instead of everyone who
-- can edit the project.
ALTER TABLE "NotebookPage" ADD COLUMN "reviewRequestedFromId" TEXT;

ALTER TABLE "NotebookPage" ADD CONSTRAINT "NotebookPage_reviewRequestedFromId_fkey" FOREIGN KEY ("reviewRequestedFromId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
