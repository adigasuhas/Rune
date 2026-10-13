/**
 * `countries-and-timezones` ships data-shape types only (esm/types.d.ts has
 * no function declarations) - this fills in the handful of functions this
 * project actually calls, matching its real runtime exports.
 */
declare module 'countries-and-timezones' {
  export interface CtCountry {
    id: string;
    name: string;
    timezones: string[];
  }
  export interface CtTimezone {
    name: string;
    countries: string[];
    utcOffset: number;
    utcOffsetStr: string;
    dstOffset: number;
    dstOffsetStr: string;
    aliasOf: string | null;
  }
  export function getCountry(countryCode: string): CtCountry | null;
  export function getAllCountries(): Record<string, CtCountry>;
  export function getTimezone(timezoneName: string): CtTimezone | null;
  export function getAllTimezones(): Record<string, CtTimezone>;
  export function getCountriesForTimezone(timezoneName: string): CtCountry[];
  export function getTimezonesForCountry(countryCode: string): CtTimezone[] | null;

  const _default: {
    getCountry: typeof getCountry;
    getAllCountries: typeof getAllCountries;
    getTimezone: typeof getTimezone;
    getAllTimezones: typeof getAllTimezones;
    getCountriesForTimezone: typeof getCountriesForTimezone;
    getTimezonesForCountry: typeof getTimezonesForCountry;
  };
  export default _default;
}
