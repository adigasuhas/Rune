-- Phase 2: opt-in "visible to my sub-group" flag for team-leader read access.
ALTER TABLE "Project" ADD COLUMN "visibleToSubgroup" BOOLEAN NOT NULL DEFAULT false;
