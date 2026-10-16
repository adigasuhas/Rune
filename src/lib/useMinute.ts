'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, re-rendering on each minute boundary (not a free-running
 * interval, so it never lags the system clock by up to 59s). Minute
 * resolution is all the time displays need - nothing ticks every second.
 */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: number;
    const schedule = () => {
      const d = new Date();
      t = window.setTimeout(() => { setNow(new Date()); schedule(); }, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, []);
  return now;
}
