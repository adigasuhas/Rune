-- Phase 4: per-notification-type opt-out preferences.
ALTER TABLE "Setting" ADD COLUMN "notificationPreferences" JSONB;
