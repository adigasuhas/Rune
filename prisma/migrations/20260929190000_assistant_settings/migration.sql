-- Rune Assistant (local LLM chat widget) settings. assistantMcpTokenEnc
-- stores an AES-256-GCM-encrypted copy of a dedicated ApiToken's raw value,
-- which ApiToken itself never stores (only a one-way hash) - the app needs
-- the raw value to drive rune-mcp-server on the user's behalf.
ALTER TABLE "Setting" ADD COLUMN "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN "assistantOllamaModel" TEXT NOT NULL DEFAULT 'qwen2.5:3b';
ALTER TABLE "Setting" ADD COLUMN "assistantMcpTokenId" TEXT;
ALTER TABLE "Setting" ADD COLUMN "assistantMcpTokenEnc" TEXT;
