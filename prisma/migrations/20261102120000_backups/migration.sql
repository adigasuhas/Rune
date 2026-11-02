
-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('OFF', 'DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "backupFrequency" "BackupFrequency" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "lastBackupAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "backupEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backupFrequency" "BackupFrequency" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "backupFullCopy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "backupKeep" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "backupNotebooks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "backupTasks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastBackupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "trigger" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contents" JSONB NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_userId_projectId_createdAt_idx" ON "Backup"("userId", "projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

