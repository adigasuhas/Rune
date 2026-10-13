/**
 * Local, on-device speech-to-text via transformers.js (an ONNX-runtime port
 * of Whisper) - deliberately not the PyPI `openai-whisper` package. That
 * would need Python + pip + a multi-GB PyTorch install on the host; this is
 * a plain npm dependency (@huggingface/transformers) that runs the same
 * Whisper weights over ONNX Runtime, CPU-only, with nothing for the operator
 * to install by hand. The model itself is fetched once (see
 * scripts/download-whisper-model.mjs, run by `npm run setup`) and cached
 * under RUNE_DATA_DIR so it survives restarts and Docker's mounted volume.
 *
 * Audio and its transcript never leave this process - there is no network
 * call in the transcription path.
 */
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const DEFAULT_MODEL = 'Xenova/whisper-base.en';
const TARGET_SAMPLE_RATE = 16000;

export function whisperModelId(): string {
  return process.env.RUNE_WHISPER_MODEL || DEFAULT_MODEL;
}

export function whisperCacheDir(): string {
  const dataDir = process.env.RUNE_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
  return process.env.RUNE_WHISPER_CACHE_DIR || path.join(/*turbopackIgnore: true*/ dataDir, 'models');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsrPipeline = (input: Float32Array, options?: Record<string, unknown>) => Promise<any>;
let pipelinePromise: Promise<AsrPipeline> | null = null;

async function getPipeline(): Promise<AsrPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = whisperCacheDir();
      return (await pipeline('automatic-speech-recognition', whisperModelId())) as unknown as AsrPipeline;
    })().catch((err) => {
      pipelinePromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return pipelinePromise;
}

/** True if the local Whisper model can be loaded right now (already downloaded, or downloadable). Never throws. */
export async function isWhisperAvailable(): Promise<boolean> {
  try {
    await getPipeline();
    return true;
  } catch (err) {
    console.error('[whisper] Local Whisper is unavailable:', err);
    return false;
  }
}

/**
 * Decodes an arbitrary browser recording (webm/opus, ogg, mp4/aac - whatever
 * MediaRecorder produced) into raw 16kHz mono PCM, using the ffmpeg binary
 * bundled by the `ffmpeg-static` npm package. No system ffmpeg install
 * required - the binary is fetched automatically at `npm install` time.
 */
function decodeToPcm16k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('Bundled ffmpeg binary is missing - reinstall dependencies (npm install).'));
      return;
    }
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-f', 's16le', '-ar', String(TARGET_SAMPLE_RATE), '-ac', '1',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Audio decoding failed: ${stderr.trim() || `ffmpeg exited with code ${code}`}`));
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function pcm16ToFloat32(pcm: Buffer): Float32Array {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

/** Transcribes a recorded audio buffer entirely on this machine. */
export async function transcribeAudio(buffer: Buffer): Promise<string> {
  const pcm = await decodeToPcm16k(buffer);
  const samples = pcm16ToFloat32(pcm);
  const transcriber = await getPipeline();
  const result = await transcriber(samples, { chunk_length_s: 30 });
  const text = Array.isArray(result) ? result[0]?.text : result?.text;
  return (text || '').trim();
}
