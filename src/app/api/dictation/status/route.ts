import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isWhisperAvailable } from '@/lib/whisper';

/** Lets the client know whether the local Whisper fallback is usable, before offering it as a dictation option. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const whisperAvailable = await isWhisperAvailable();
  return NextResponse.json({ whisperAvailable }, { headers: { 'Cache-Control': 'no-store' } });
}
export const dynamic = 'force-dynamic';
