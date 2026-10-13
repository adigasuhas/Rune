'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface ClockTimePickerProps {
  value: string; // "HH:MM" 24h format
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
}

export function ClockTimePicker({ value, onChange, placeholder = 'Set time', className = '', align = 'left' }: ClockTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour'); // 'hour' or 'minute'
  const [selectedHour, setSelectedHour] = useState(12); // 1-12
  const [selectedMinute, setSelectedMinute] = useState(0); // 0-59
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value on mount/change
  useEffect(() => {
    if (value && value.includes(':')) {
      const [h24Str, mStr] = value.split(':');
      const h24 = parseInt(h24Str, 10) || 0;
      const m = parseInt(mStr, 10) || 0;
      
      setSelectedMinute(m);
      if (h24 >= 12) {
        setAmpm('PM');
        setSelectedHour(h24 === 12 ? 12 : h24 - 12);
      } else {
        setAmpm('AM');
        setSelectedHour(h24 === 0 ? 12 : h24);
      }
    } else {
      // Defaults
      setSelectedHour(9);
      setSelectedMinute(0);
      setAmpm('AM');
    }
  }, [value, isOpen]);

  // Close when clicking outside, or on Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const saveTime = (hour: number, minute: number, currentAmpm: 'AM' | 'PM') => {
    let h24 = hour;
    if (currentAmpm === 'PM' && hour < 12) {
      h24 = hour + 12;
    } else if (currentAmpm === 'AM' && hour === 12) {
      h24 = 0;
    }
    const hh = String(h24).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    onChange(`${hh}:${mm}`);
  };

  const handleHourSelect = (h: number) => {
    setSelectedHour(h);
    saveTime(h, selectedMinute, ampm);
    setMode('minute'); // Automatically switch to minute
  };

  const handleMinuteSelect = (m: number) => {
    setSelectedMinute(m);
    saveTime(selectedHour, m, ampm);
  };

  const handleAmpmSelect = (ap: 'AM' | 'PM') => {
    setAmpm(ap);
    saveTime(selectedHour, selectedMinute, ap);
  };

  const formattedDisplay = () => {
    if (!value) return '';
    const hrStr = String(selectedHour).padStart(2, '0');
    const minStr = String(selectedMinute).padStart(2, '0');
    return `${hrStr}:${minStr} ${ampm}`;
  };

  // 12 positions around clock face for hours
  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  // 12 positions around clock face for minutes
  const minutesList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  // Helper to place items in a circle
  const getPositionStyles = (index: number) => {
    const angle = (index * 30 * Math.PI) / 180; // 30 degrees per position
    const radius = 38; // radius in percentage
    const x = 50 + radius * Math.sin(angle);
    const y = 50 - radius * Math.cos(angle);
    return {
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  // Angle for hand pointer
  const getHandRotation = () => {
    if (mode === 'hour') {
      return (selectedHour % 12) * 30; // 30 deg per hour
    } else {
      return selectedMinute * 6; // 6 deg per minute
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          setMode('hour');
        }}
        className="flex items-center justify-between w-full bg-surface-raised border border-border rounded-[var(--radius-md)] px-4 py-2.5 text-foreground text-sm cursor-pointer hover:border-border-strong focus-within:border-primary transition-colors duration-[var(--duration-micro)] font-mono"
      >
        <span className={formattedDisplay() ? 'text-foreground' : 'text-muted-foreground'}>
          {formattedDisplay() || placeholder}
        </span>
        <Clock className="w-4.5 h-4.5 text-muted-foreground shrink-0" />
      </div>

      {isOpen && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 z-[999] w-64 bg-card border border-border rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-lg)] space-y-4`}>
          {/* Header Time Display */}
          <div className="flex justify-between items-center bg-surface-sunken/65 border border-border px-3 py-2 rounded-[var(--radius-md)]">
            <div className="flex items-center space-x-2 text-sm font-bold font-mono">
              {/* Hour group */}
              <div className="flex items-center space-x-0.5">
                <button
                  type="button"
                  onClick={() => setMode('hour')}
                  className={`px-1.5 py-1 rounded text-sm cursor-pointer ${mode === 'hour' ? 'text-primary bg-primary-soft border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {String(selectedHour).padStart(2, '0')}
                </button>
                <div className="flex flex-col text-[8px] leading-[6px] text-ink-faint">
                  <button
                    type="button"
                    onClick={() => {
                      const next = selectedHour === 12 ? 1 : selectedHour + 1;
                      setSelectedHour(next);
                      saveTime(next, selectedMinute, ampm);
                    }}
                    className="hover:text-primary p-0.5 cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = selectedHour === 1 ? 12 : selectedHour - 1;
                      setSelectedHour(next);
                      saveTime(next, selectedMinute, ampm);
                    }}
                    className="hover:text-primary p-0.5 cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
              </div>

              <span className="text-ink-faint">:</span>

              {/* Minute group */}
              <div className="flex items-center space-x-0.5">
                <button
                  type="button"
                  onClick={() => setMode('minute')}
                  className={`px-1.5 py-1 rounded text-sm cursor-pointer ${mode === 'minute' ? 'text-primary bg-primary-soft border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {String(selectedMinute).padStart(2, '0')}
                </button>
                <div className="flex flex-col text-[8px] leading-[6px] text-ink-faint">
                  <button
                    type="button"
                    onClick={() => {
                      const next = (selectedMinute + 1) % 60;
                      setSelectedMinute(next);
                      saveTime(selectedHour, next, ampm);
                    }}
                    className="hover:text-primary p-0.5 cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = (selectedMinute - 1 + 60) % 60;
                      setSelectedMinute(next);
                      saveTime(selectedHour, next, ampm);
                    }}
                    className="hover:text-primary p-0.5 cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
            {/* AM/PM toggle */}
            <div className="flex space-x-1 bg-surface-sunken border border-border-strong rounded-lg p-0.5 text-xs font-bold font-mono">
              <button
                type="button"
                onClick={() => handleAmpmSelect('AM')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${ampm === 'AM' ? 'bg-surface-raised text-foreground border border-border-strong' : 'text-muted-foreground hover:text-ink-secondary'}`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => handleAmpmSelect('PM')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${ampm === 'PM' ? 'bg-surface-raised text-foreground border border-border-strong' : 'text-muted-foreground hover:text-ink-secondary'}`}
              >
                PM
              </button>
            </div>
          </div>

          {/* Graphical Clock Dial */}
          <div className="relative w-48 h-48 mx-auto bg-surface-sunken/50 border border-border rounded-full flex items-center justify-center select-none shadow-inner">
            {/* Center Pivot */}
            <div className="absolute w-2 h-2 bg-primary rounded-full z-20"></div>

            {/* Clock Hand pointer */}
            <div
              className="absolute w-0.5 bg-primary z-10 origin-bottom rounded-full transition-transform duration-[var(--duration-standard)] ease-out"
              style={{
                height: '38%',
                top: '12%',
                left: '50%',
                marginLeft: '-1px',
                transform: `rotate(${getHandRotation()}deg)`,
                transformOrigin: 'bottom center'
              }}
            >
              {/* Arrow tip at the end of the hand */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-primary border border-black/40 rounded-full -mt-2"></div>
            </div>

            {/* List of Numbers (Hours or Minutes) */}
            {mode === 'hour' ? (
              hoursList.map((h, i) => {
                const isSelected = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleHourSelect(h)}
                    style={getPositionStyles(i)}
                    className={`absolute w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-colors z-20 cursor-pointer ${
                      isSelected
                        ? 'text-primary-foreground font-extrabold z-30 scale-110'
                        : 'text-muted-foreground hover:bg-surface-sunken/60 hover:text-foreground'
                    }`}
                  >
                    {h}
                  </button>
                );
              })
            ) : (
              minutesList.map((m, i) => {
                const isSelected = Math.round(selectedMinute / 5) * 5 % 60 === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteSelect(m)}
                    style={getPositionStyles(i)}
                    className={`absolute w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-colors z-20 cursor-pointer ${
                      isSelected
                        ? 'text-primary-foreground font-extrabold z-30 scale-110'
                        : 'text-muted-foreground hover:bg-surface-sunken/60 hover:text-foreground'
                    }`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                );
              })
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center pt-2 border-t border-border text-xs">
            <span className="text-[11.5px] text-ink-faint font-semibold font-mono">
              Mode: {mode}
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 bg-surface-sunken hover:bg-border text-ink-secondary font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
