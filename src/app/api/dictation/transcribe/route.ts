import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { transcribeAudio } from '@/lib/whisper';

// Generous for a few minutes of compressed speech - dictation is a short
// utterance, not a long recording upload.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Transcribes a short recording with the local Whisper fallback - used only when the browser has no built-in speech recognition. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const limited = enforceRateLimit(req, 'dictation-transcribe', 30, 5 * 60_000, session.userId);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'No audio was uploaded.' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: 'The recording was empty.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That recording is too long. Try a shorter one.' }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const text = await transcribeAudio(buffer);
    return NextResponse.json({ text });
  } catch (err) {
    console.error('Local dictation transcription failed:', err);
    return NextResponse.json(
      { error: 'Local dictation is unavailable right now. Try again, or use browser dictation instead.' },
      { status: 503 }
    );
  }
}
export const dynamic = 'force-dynamic';
