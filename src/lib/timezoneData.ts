import {
  getAllCountries as ctGetAllCountries,
  getCountry as ctGetCountry,
  getAllTimezones as ctGetAllTimezones,
  getCountriesForTimezone as ctGetCountriesForTimezone,
} from 'countries-and-timezones';

/**
 * Timezone data helpers for the world-map picker (src/components/TimezonePicker.tsx).
 *
 * The IANA/Olson zone list itself comes straight from the JS runtime's own
 * `Intl.supportedValuesOf('timeZone')` - no separate dataset to keep in sync,
 * since every modern browser and Node 18+ ships the full tz database and
 * updates it with the platform. `countries-and-timezones` (built on the same
 * IANA data) supplies the country <-> timezone relationships a map needs.
 *
 * UTC offsets are computed live via `Intl.DateTimeFormat` for "right now",
 * which is what makes daylight saving automatic: a zone currently observing
 * DST reports its DST offset, and one that isn't reports standard time,
 * with no separate DST calculation of our own.
 */

export interface CountryInfo {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  timezones: string[];
}

export function getAllIanaTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Extremely old runtime without Intl.supportedValuesOf - fall back to
    // whatever countries-and-timezones knows about rather than an empty list.
    return Object.keys(ctGetAllTimezones());
  }
}

export function getCountry(alpha2: string): CountryInfo | null {
  const c = ctGetCountry(alpha2);
  return c ? { code: c.id, name: c.name, timezones: c.timezones } : null;
}

export function getAllCountries(): CountryInfo[] {
  return Object.values(ctGetAllCountries())
    .map((c) => ({ code: c.id, name: c.name, timezones: c.timezones }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which countries use a given IANA zone, e.g. for highlighting a map by the selected timezone. */
export function getCountriesForTimezone(tz: string): string[] {
  return ctGetCountriesForTimezone(tz).map((c) => c.id);
}

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires" */
export function timezoneCityLabel(tz: string): string {
  const parts = tz.split('/');
  return (parts[parts.length - 1] || tz).replace(/_/g, ' ');
}

/** "America/Argentina/Buenos_Aires" -> "Argentina / Buenos Aires" */
export function timezoneFullLabel(tz: string): string {
  return tz.split('/').map((p) => p.replace(/_/g, ' ')).join(' / ');
}

/** Live UTC offset, DST-aware, e.g. "UTC-05:00" or "UTC+05:30". */
export function currentUtcOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
    return raw.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

/** Live local clock time in that zone, e.g. "2:34 PM". */
export function currentLocalTimeLabel(tz: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at);
  } catch {
    return '';
  }
}

/** True if `tz` is currently observing daylight saving (its live offset differs from January's). */
export function isCurrentlyDst(tz: string): boolean {
  try {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    const offsetAt = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).format(d);
    const standard = offsetAt(jan) === offsetAt(jul) ? offsetAt(jan) : [offsetAt(jan), offsetAt(jul)].sort()[0];
    return offsetAt(now) !== standard;
  } catch {
    return false;
  }
}

export interface TimezoneSearchEntry {
  tz: string;
  cityLabel: string;
  countryNames: string[];
  searchText: string;
}

let _searchIndex: TimezoneSearchEntry[] | null = null;

/** Built once and cached - every zone paired with the country name(s) that use it, for the search box. */
export function getTimezoneSearchIndex(): TimezoneSearchEntry[] {
  if (_searchIndex) return _searchIndex;
  const all = getAllIanaTimezones();
  _searchIndex = all.map((tz) => {
    const countryCodes = getCountriesForTimezone(tz);
    const countryNames = countryCodes.map((c) => ctGetCountry(c)?.name).filter((n): n is string => !!n);
    const cityLabel = timezoneCityLabel(tz);
    return {
      tz,
      cityLabel,
      countryNames,
      searchText: `${tz} ${cityLabel} ${countryNames.join(' ')}`.toLowerCase(),
    };
  });
  return _searchIndex;
}

export function searchTimezones(query: string, limit = 30): TimezoneSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getTimezoneSearchIndex()
    .filter((e) => e.searchText.includes(q))
    .sort((a, b) => {
      // Prefer matches at the start of the city name or a country name.
      const aStarts = a.cityLabel.toLowerCase().startsWith(q) || a.countryNames.some((n) => n.toLowerCase().startsWith(q));
      const bStarts = b.cityLabel.toLowerCase().startsWith(q) || b.countryNames.some((n) => n.toLowerCase().startsWith(q));
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.cityLabel.localeCompare(b.cityLabel);
    })
    .slice(0, limit);
}
