-- Phase 4: @mention notifications in team chat.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_MENTION';
