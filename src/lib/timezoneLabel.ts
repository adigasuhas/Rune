/**
 * A short, human label for a time zone, e.g. Asia/Kolkata -> "IST" and
 * "UTC+5:30" (offset is empty for UTC itself). Intl only gives a proper abbreviation in the locale that
 * uses it (IST under en-IN, BST under en-GB, AEDT under en-AU...), so a few
 * English locales are tried; if none has one, the city stands in
 * ("Tokyo"), which reads better than a second copy of the offset.
 */
const LOCALES = ['en-US', 'en-GB', 'en-IN', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA'];

function part(tz: string, date: Date, locale: string, style: 'short' | 'longOffset'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: style }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

export function timezoneLabel(tz: string, date: Date = new Date()): { abbr: string; offset: string } {
  try {
    const raw = part(tz, date, 'en-US', 'longOffset'); // "GMT+05:30", or "GMT" at zero
    const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offset = m && (m[2] !== '00' || m[3] !== '00') ? `UTC${m[1]}${Number(m[2])}${m[3] === '00' ? '' : `:${m[3]}`}` : 'UTC';
    let abbr = '';
    for (const loc of LOCALES) {
      const s = part(tz, date, loc, 'short');
      if (s && !/^(GMT|UTC)[+-]/.test(s)) { abbr = s; break; }
    }
    if (offset === 'UTC' && (!abbr || abbr === 'UTC')) return { abbr: 'UTC', offset: '' };
    if (!abbr || abbr === offset) abbr = (tz.split('/').pop() || tz).replace(/_/g, ' ');
    return { abbr, offset };
  } catch {
    return { abbr: tz, offset: '' };
  }
}
