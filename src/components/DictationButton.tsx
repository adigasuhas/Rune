'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mic, Square, Loader2, MicOff } from 'lucide-react';
import { useDictation } from '@/hooks/useDictation';

interface DictationButtonProps {
  /** Called with each committed (final) chunk of recognized speech. */
  onTranscript: (text: string) => void;
  className?: string;
}

/** A single dictation control: picks browser speech recognition or local Whisper automatically, with no method picker exposed to the user. */
export function DictationButton({ onTranscript, className }: DictationButtonProps) {
  const [interim, setInterim] = useState('');
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInterim('');
      onTranscript(text);
    } else {
      setInterim(text);
    }
  }, [onTranscript]);

  const { status, method, error, start, stop, browserSupported } = useDictation({ onTranscript: handleTranscript });

  // Only probe the server when the browser can't do it itself - no point
  // asking if the browser path already covers this device.
  useEffect(() => {
    if (browserSupported) return;
    let cancelled = false;
    fetch('/api/dictation/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setWhisperAvailable(Boolean(d?.whisperAvailable)); })
      .catch(() => { if (!cancelled) setWhisperAvailable(false); });
    return () => { cancelled = true; };
  }, [browserSupported]);

  const isActive = status === 'listening' || status === 'transcribing';
  const unavailable = !browserSupported && whisperAvailable === false;

  if (unavailable) {
    return (
      <span
        className="p-1 text-muted-foreground/40 cursor-not-allowed"
        title="Dictation isn't available - this browser has no built-in speech recognition, and local Whisper isn't set up on this deployment."
      >
        <MicOff className="w-4 h-4" />
      </span>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={isActive ? stop : start}
        className={`p-1 hover:bg-surface-sunken rounded transition-colors cursor-pointer ${isActive ? 'text-danger' : 'text-muted-foreground hover:text-foreground'} ${className || ''}`}
        title={isActive ? 'Stop dictating' : !browserSupported ? 'Dictate (local Whisper)' : 'Dictate'}
      >
        {status === 'transcribing'
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : isActive
            ? <Square className="w-4 h-4" />
            : <Mic className="w-4 h-4" />}
      </button>
      {(isActive || error) && (
        <span className="absolute top-full left-0 mt-1 z-10 max-w-[220px] whitespace-nowrap overflow-hidden text-ellipsis text-[10px] px-2 py-1 rounded-md bg-surface-raised border border-border-strong shadow-sm">
          {error
            ? error
            : status === 'transcribing'
              ? (method === 'whisper' ? 'Transcribing locally…' : 'Transcribing…')
              : interim || 'Listening…'}
        </span>
      )}
    </div>
  );
}
