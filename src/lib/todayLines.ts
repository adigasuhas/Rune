/**
 * The one-line note under the clock on Today. It should feel like a
 * colleague's aside, not a poster: short, specific to the moment, never a
 * pep talk. Lines are chosen from what's actually true right now (time of
 * day, how much is open, overdue or done) and rotate by the hour, so the
 * same visit reads the same, but the day doesn't.
 */
export type TodayContext = {
  hour: number; // 0-23 in the user's time zone
  dayOfYear: number;
  open: number; // tasks still to do today
  done: number;
  overdue: number;
  offDay?: boolean;
};

const LINES = {
  offDay: [
    'Day off. The list will keep.',
    'Nothing here needs you today.',
    'Rest counts as progress too.',
  ],
  allDone: [
    'Everything on today’s list is done. Rare. Enjoy it.',
    'List cleared. Anything else can be tomorrow’s problem.',
    'Done for the day, on paper at least.',
  ],
  empty: [
    'A blank page. Pick the one thing that matters.',
    'Nothing planned yet. That’s a choice you get to make.',
    'Quiet so far. Put the hard thing in first.',
  ],
  overdue: [
    'A few things slipped. Move them, or let them go.',
    'Some of this is late. Start with the smallest one.',
    'Overdue isn’t a verdict. Reschedule and carry on.',
  ],
  heavy: [
    'A lot on your plate. Let’s make it manageable.',
    'One thing at a time. The rest can wait.',
    'More than one day’s worth. Pick three.',
    'You’ve got this. Rune has the list.',
  ],
  morning: [
    'Coffee first. Then the difficult thing.',
    'Best hours of the day. Spend them on the hard part.',
    'Start with the thing you’ve been avoiding.',
  ],
  afternoon: [
    'Afternoon. Good time for the shallow stuff.',
    'Halfway. Check what still fits.',
    'One focused hour beats three scattered ones.',
  ],
  evening: [
    'Late one. Leave a note for tomorrow’s you.',
    'Wrap up what’s open. The rest has a slot tomorrow.',
    'Close a loop, then close the laptop.',
  ],
  night: [
    'It’s late. Whatever this is, it can probably wait.',
    'Still here? Write it down and sleep on it.',
  ],
};

export function todayLine(c: TodayContext): string {
  let pool: string[];
  if (c.offDay) pool = LINES.offDay;
  else if (c.open === 0 && c.done > 0) pool = LINES.allDone;
  else if (c.hour >= 23 || c.hour < 5) pool = LINES.night;
  else if (c.overdue >= 2) pool = LINES.overdue;
  else if (c.open === 0) pool = LINES.empty;
  else if (c.open >= 6) pool = LINES.heavy;
  else if (c.hour < 12) pool = LINES.morning;
  else if (c.hour < 18) pool = LINES.afternoon;
  else pool = LINES.evening;
  const seed = c.dayOfYear * 7 + c.hour;
  return pool[seed % pool.length];
}
