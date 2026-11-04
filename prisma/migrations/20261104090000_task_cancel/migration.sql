-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_CANCELLED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
