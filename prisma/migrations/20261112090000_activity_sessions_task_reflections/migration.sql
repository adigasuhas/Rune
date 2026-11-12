-- Breaks and brain drain (never shown on a calendar) and completion reflections.
CREATE TYPE "ActivityKind" AS ENUM ('BREAK', 'BRAIN_DRAIN');

CREATE TABLE "ActivitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskReflection" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "completedOn" TEXT NOT NULL,
    "productiveMoment" TEXT,
    "timeWaster" TEXT,
    "gladFinished" TEXT,
    "improvement" TEXT,
    "planningRealistic" TEXT,
    "lesson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskReflection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivitySession_userId_start_idx" ON "ActivitySession"("userId", "start");
CREATE UNIQUE INDEX "TaskReflection_taskId_key" ON "TaskReflection"("taskId");
CREATE INDEX "TaskReflection_userId_completedOn_idx" ON "TaskReflection"("userId", "completedOn");
CREATE INDEX "TaskReflection_projectId_idx" ON "TaskReflection"("projectId");

ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReflection" ADD CONSTRAINT "TaskReflection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReflection" ADD CONSTRAINT "TaskReflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (by hand; Prisma doesn't run down migrations):
--   DROP TABLE "TaskReflection"; DROP TABLE "ActivitySession"; DROP TYPE "ActivityKind";
