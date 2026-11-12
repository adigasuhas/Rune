/** 12-hour clock helpers for the time picker. */

export type Meridiem = 'AM' | 'PM';

/** 1-12 plus AM/PM to 0-23. */
export function toH24(hour12: number, meridiem: Meridiem): number {
  const h = hour12 % 12;
  return meridiem === 'PM' ? h + 12 : h;
}

/**
 * The half of the day for a newly picked 12-hour `hour12`, chosen so the
 * result is as close as possible (around the clock) to `currentH24`, the
 * time being changed. Crossing noon or midnight by an hour or two flips
 * AM/PM; anything else keeps it. A tie keeps the current half.
 */
export function nearestMeridiem(currentH24: number, hour12: number): Meridiem {
  const keep: Meridiem = currentH24 >= 12 ? 'PM' : 'AM';
  const flip: Meridiem = keep === 'AM' ? 'PM' : 'AM';
  const dist = (h: number) => {
    const d = Math.abs(h - currentH24) % 24;
    return Math.min(d, 24 - d);
  };
  return dist(toH24(hour12, flip)) < dist(toH24(hour12, keep)) ? flip : keep;
}
