-- Phase 2: BLOCKED task state + "waiting on" person, Run <-> notebook-page
-- linking, and the notification types the new digest / review / comment
-- surfaces raise.

-- AlterEnum: new task state
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

-- AlterEnum: new notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WEEKLY_DIGEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NOTEBOOK_REVIEW_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NOTEBOOK_COMMENT';

-- AlterTable: Task gains the "blocked on" pointer + free-text reason
ALTER TABLE "Task" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "Task" ADD COLUMN "blockedOnUserId" TEXT;

-- AlterTable: Job (a.k.a. Run) can point at the notebook page that writes it up
ALTER TABLE "Job" ADD COLUMN "notebookPageId" TEXT;

-- CreateIndex
CREATE INDEX "Task_blockedOnUserId_idx" ON "Task"("blockedOnUserId");
CREATE INDEX "Job_notebookPageId_idx" ON "Job"("notebookPageId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_blockedOnUserId_fkey" FOREIGN KEY ("blockedOnUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_notebookPageId_fkey" FOREIGN KEY ("notebookPageId") REFERENCES "NotebookPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
