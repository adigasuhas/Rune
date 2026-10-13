-- Phase 4: task accept/decline workflow (assignment state, separate from
-- execution state) + the notification types it raises. passwordHash on
-- User already exists (init migration) - password login just starts using
-- it, no schema change needed there.

-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'DECLINED');

-- AlterEnum: new notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_DECLINED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assignmentStatus" "TaskAssignmentStatus";
ALTER TABLE "Task" ADD COLUMN "declineReason" TEXT;
