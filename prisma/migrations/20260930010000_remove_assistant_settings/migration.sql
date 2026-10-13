-- Rune Assistant (local LLM chat widget) removed - see
-- 20260929190000_assistant_settings for the migration that added these.
ALTER TABLE "Setting" DROP COLUMN "assistantEnabled";
ALTER TABLE "Setting" DROP COLUMN "assistantOllamaModel";
ALTER TABLE "Setting" DROP COLUMN "assistantMcpTokenId";
ALTER TABLE "Setting" DROP COLUMN "assistantMcpTokenEnc";
