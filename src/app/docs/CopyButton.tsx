'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.trim());
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard refused - text is on screen */ }
      }}
      className="rounded-[6px] px-2 py-0.5 text-[12.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
      aria-live="polite"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
