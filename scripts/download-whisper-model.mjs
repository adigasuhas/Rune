#!/usr/bin/env node
// Downloads (and caches) the local Whisper speech-to-text model, so the
// first real dictation a user does isn't the first time the ~150MB model
// gets fetched. Run automatically by `npm run setup` (unless skipped); safe
// to re-run - a model already cached is a no-op.
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

const MODEL = process.env.RUNE_WHISPER_MODEL || 'Xenova/whisper-base.en';
const CACHE_DIR = process.env.RUNE_WHISPER_CACHE_DIR
  || path.join(process.env.RUNE_DATA_DIR || path.join(process.cwd(), 'data'), 'models');

async function main() {
  console.log(`Downloading the local Whisper model (${MODEL})... this can take a few minutes the first time.`);
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = CACHE_DIR;
  await pipeline('automatic-speech-recognition', MODEL);
  console.log(`Whisper model ready (cached under ${CACHE_DIR}). Local dictation will work offline from now on.`);
}

main().catch((err) => {
  console.error('Could not download the Whisper model:', err instanceof Error ? err.message : err);
  console.error('Local dictation will be unavailable until this succeeds - browser dictation still works if supported.');
  process.exit(1);
});
