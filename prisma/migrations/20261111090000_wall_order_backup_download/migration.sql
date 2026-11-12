-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "lastBackupDownloadAt" TIMESTAMP(3),
ADD COLUMN     "wallProjectOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
