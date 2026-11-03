-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "availableFrom" TEXT,
ADD COLUMN     "availableUntil" TEXT,
ADD COLUMN     "leaveAllowance" INTEGER,
ADD COLUMN     "leaveAllowancePer" TEXT NOT NULL DEFAULT 'YEAR',
ADD COLUMN     "sickLeaveAllowance" INTEGER;
