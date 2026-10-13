'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

interface ColorPreset {
  name: string;
  value: string;
}

interface ColorPickerPopoverProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  presets: ColorPreset[];
  onPick: (hex: string) => void;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function ColorPickerPopover({ icon: Icon, label, title, presets, onPick }: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setError(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setError(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Deliberately stays open after a pick — applying a color is usually one step
  // in formatting several separate selections in a row, and re-clicking the
  // toolbar icon each time was the exact "toolbar keeps hiding" complaint this
  // replaced. It only closes on outside click, Escape, or the toggle button.
  const pick = (hex: string) => {
    onPick(hex);
    setHexInput('');
    setError(false);
  };

  const applyHex = () => {
    let hex = hexInput.trim();
    if (!hex) return;
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (!HEX_RE.test(hex)) {
      setError(true);
      return;
    }
    pick(hex);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors h-7 w-7 flex items-center justify-center ${open ? 'bg-surface-sunken text-foreground' : ''}`}
        title={title}
      >
        <Icon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 bg-card border border-border rounded-md shadow-[var(--shadow-modal)] p-3 space-y-3 z-40">
          <div className="text-[11.5px] font-semibold text-foreground">{label}</div>

          <div className="grid grid-cols-7 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => pick(p.value)}
                className="w-6 h-6 rounded-full border border-border-strong/60 cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                style={{ backgroundColor: p.value }}
                title={p.name}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-border/60">
            <label
              className="relative w-7 h-7 rounded-lg overflow-hidden border border-border-strong cursor-pointer shrink-0"
              title="Pick a custom color"
            >
              <input
                type="color"
                onChange={(e) => pick(e.target.value)}
                className="absolute -top-1 -left-1 w-9 h-9 cursor-pointer border-none p-0"
              />
            </label>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => { setHexInput(e.target.value); setError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') applyHex(); }}
              placeholder="#RRGGBB"
              className={`flex-1 min-w-0 bg-surface-raised border rounded-lg px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none ${error ? 'border-danger focus:border-danger' : 'border-border-strong focus:border-primary'}`}
            />
            <button
              type="button"
              onClick={applyHex}
              className="p-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors cursor-pointer shrink-0"
              aria-label="Apply hex color" title="Apply hex color"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <div className="text-[10px] text-danger -mt-1.5">Enter a valid hex code, such as #ff5733.</div>}
        </div>
      )}
    </div>
  );
}
