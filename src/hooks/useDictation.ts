'use client';

/**
 * Dictation with automatic method selection: the browser's built-in
 * SpeechRecognition when available, local Whisper (server-side, on-device)
 * otherwise. Callers don't choose a method - `start()` picks one.
 *
 * A caveat worth knowing: in Chrome/Edge, `webkitSpeechRecognition` is not
 * actually on-device - the browser vendor streams the audio to its own
 * cloud speech service to produce the transcript, despite being a plain
 * client-side JS API. Firefox and Safari currently ship no implementation at
 * all. The local Whisper fallback is the only one of the two methods where
 * audio never leaves this machine.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type DictationStatus = 'idle' | 'listening' | 'transcribing' | 'completed' | 'unavailable' | 'error';
export type DictationMethod = 'browser' | 'whisper' | null;

interface UseDictationOptions {
  /** Called with each recognized chunk. `isFinal` chunks should be committed; interim ones are a live preview only. */
  onTranscript: (text: string, isFinal: boolean) => void;
  language?: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
}

// Browser recognition errors that mean "this service is not reachable/usable
// right now" (as opposed to no-speech/aborted, which aren't real failures,
// or not-allowed/audio-capture, which are a mic-permission problem that
// switching methods won't fix either). Chrome/Edge's implementation calls
// out to the vendor's own speech service - on a network with no route to
// it (a firewalled office, an offline/air-gapped machine, a sandboxed dev
// environment), every attempt fails with exactly this error despite the
// browser correctly reporting the API as "supported".
const BROWSER_SERVICE_UNREACHABLE_ERRORS = new Set(['network', 'service-not-allowed']);

export function useDictation({ onTranscript, language = 'en-US' }: UseDictationOptions) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [method, setMethod] = useState<DictationMethod>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  // Per-attempt state for the browser->Whisper fallback: only fall back once
  // per start(), and only if the browser service never produced a result
  // (an error after real results came in is a mid-session hiccup, not a
  // reason to restart on a different method).
  const gotBrowserResultRef = useRef(false);
  const fellBackRef = useRef(false);

  const browserSupported = getSpeechRecognitionCtor() !== null;

  const startWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus('transcribing');
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          const form = new FormData();
          form.append('audio', blob, 'dictation.webm');
          const res = await fetch('/api/dictation/transcribe', { method: 'POST', body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data.text === 'string') {
            if (data.text) onTranscriptRef.current(data.text, true);
            setStatus('completed');
          } else {
            setError(data.error || 'Local transcription failed.');
            setStatus('error');
          }
        } catch {
          setError('Local transcription failed. Check the server and try again.');
          setStatus('error');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setMethod('whisper');
      setStatus('listening');
      setError(null);
    } catch {
      setError('Microphone access was denied.');
      setStatus('error');
    }
  }, []);

  const startBrowser = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    gotBrowserResultRef.current = false;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => { setStatus('listening'); setMethod('browser'); setError(null); };
    recognition.onresult = (event) => {
      gotBrowserResultRef.current = true;
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) onTranscriptRef.current(final, true);
      else if (interim) onTranscriptRef.current(interim, false);
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (
        BROWSER_SERVICE_UNREACHABLE_ERRORS.has(event.error) &&
        !gotBrowserResultRef.current &&
        !fellBackRef.current
      ) {
        // The browser reported speech recognition as supported, but its
        // backing service isn't actually reachable - switch to local
        // Whisper for this attempt instead of just failing.
        fellBackRef.current = true;
        startWhisper();
        return;
      }
      setError(event.error === 'not-allowed' ? 'Microphone access was denied.' : `Dictation error: ${event.error}`);
      setStatus('error');
    };
    recognition.onend = () => {
      setStatus((s) => (s === 'error' || (s === 'listening' && fellBackRef.current) ? s : 'completed'));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [language, startWhisper]);

  const start = useCallback(() => {
    fellBackRef.current = false;
    if (browserSupported) startBrowser();
    else startWhisper();
  }, [browserSupported, startBrowser, startWhisper]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { status, method, error, start, stop, browserSupported };
}
