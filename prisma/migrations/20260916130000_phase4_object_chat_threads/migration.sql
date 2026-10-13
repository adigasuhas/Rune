-- Phase 4: per-project/per-task contextual discussion threads, reusing
-- ChatMessage's existing scope + conversationKey columns (no new columns).
ALTER TYPE "ChatScope" ADD VALUE IF NOT EXISTS 'OBJECT';
