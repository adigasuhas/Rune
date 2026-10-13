-- Phase 7: a project can hold more than one notebook (GoodNotes-style -
-- project = folder, each notebook inside it is its own continuous
-- document). Drop the one-notebook-per-project constraint and index it as
-- a plain (non-unique) foreign key column instead.
DROP INDEX "Notebook_projectId_key";
CREATE INDEX "Notebook_projectId_idx" ON "Notebook"("projectId");
