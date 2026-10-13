-- Task is the highest-traffic table in the schema (loaded on nearly every
-- page via "my tasks for today"), but had no indexes on its query columns.
-- These back the two dominant access patterns: date-scoped lookups and the
-- Tasks board's status filter.
CREATE INDEX "Task_userId_date_idx" ON "Task"("userId", "date");
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");
