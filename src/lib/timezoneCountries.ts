/**
 * Bridges world-atlas's topojson world map (keyed by numeric ISO 3166-1
 * country codes, e.g. "840" for the US - the `id` on each GeoJSON feature)
 * to `countries-and-timezones`' IANA/Olson timezone data (keyed by alpha-2
 * codes, e.g. "US"). Generated once by matching country names between the
 * two datasets (see git history for the generator) and hand-verified - 173
 * of world-atlas's 177 land features matched cleanly; Kosovo has no numeric
 * id in this topojson at all and is resolved by name instead (NAME_OVERRIDES).
 */

export const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '010': 'AQ', '012': 'DZ', '024': 'AO', '031': 'AZ',
  '032': 'AR', '036': 'AU', '040': 'AT', '044': 'BS', '050': 'BD', '051': 'AM',
  '056': 'BE', '064': 'BT', '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR',
  '084': 'BZ', '090': 'SB', '096': 'BN', '100': 'BG', '104': 'MM', '108': 'BI',
  '112': 'BY', '116': 'KH', '120': 'CM', '124': 'CA', '140': 'CF', '144': 'LK',
  '148': 'TD', '152': 'CL', '156': 'CN', '158': 'TW', '170': 'CO', '178': 'CG',
  '180': 'CD', '188': 'CR', '191': 'HR', '192': 'CU', '196': 'CY', '203': 'CZ',
  '204': 'BJ', '208': 'DK', '214': 'DO', '218': 'EC', '222': 'SV', '226': 'GQ',
  '231': 'ET', '232': 'ER', '233': 'EE', '238': 'FK', '242': 'FJ', '246': 'FI',
  '250': 'FR', '262': 'DJ', '266': 'GA', '268': 'GE', '270': 'GM', '275': 'PS',
  '276': 'DE', '288': 'GH', '300': 'GR', '304': 'GL', '320': 'GT', '324': 'GN',
  '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU', '352': 'IS', '356': 'IN',
  '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE', '376': 'IL', '380': 'IT',
  '384': 'CI', '388': 'JM', '392': 'JP', '398': 'KZ', '400': 'JO', '404': 'KE',
  '408': 'KP', '410': 'KR', '414': 'KW', '417': 'KG', '418': 'LA', '422': 'LB',
  '426': 'LS', '428': 'LV', '430': 'LR', '434': 'LY', '440': 'LT', '442': 'LU',
  '450': 'MG', '454': 'MW', '458': 'MY', '466': 'ML', '478': 'MR', '484': 'MX',
  '496': 'MN', '498': 'MD', '499': 'ME', '504': 'MA', '508': 'MZ', '512': 'OM',
  '516': 'NA', '524': 'NP', '528': 'NL', '540': 'NC', '548': 'VU', '554': 'NZ',
  '558': 'NI', '562': 'NE', '566': 'NG', '578': 'NO', '586': 'PK', '591': 'PA',
  '598': 'PG', '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL', '620': 'PT',
  '624': 'GW', '626': 'TL', '630': 'PR', '634': 'QA', '642': 'RO', '643': 'RU',
  '646': 'RW', '682': 'SA', '686': 'SN', '688': 'RS', '694': 'SL', '703': 'SK',
  '704': 'VN', '705': 'SI', '706': 'SO', '710': 'ZA', '716': 'ZW', '724': 'ES',
  '728': 'SS', '729': 'SD', '732': 'EH', '740': 'SR', '748': 'SZ', '752': 'SE',
  '756': 'CH', '760': 'SY', '762': 'TJ', '764': 'TH', '768': 'TG', '780': 'TT',
  '784': 'AE', '788': 'TN', '792': 'TR', '795': 'TM', '800': 'UG', '804': 'UA',
  '807': 'MK', '818': 'EG', '826': 'GB', '834': 'TZ', '840': 'US', '854': 'BF',
  '858': 'UY', '860': 'UZ', '862': 'VE', '887': 'YE', '894': 'ZM',
};

/** Features whose topojson `id` is missing or unreliable - matched by name instead. */
export const NAME_TO_ALPHA2_OVERRIDES: Record<string, string> = {
  Kosovo: 'XK',
};

export function alpha2ForFeature(featureId: string | number | undefined, featureName: string): string | null {
  const byId = featureId !== undefined ? ISO_NUMERIC_TO_ALPHA2[String(featureId)] : undefined;
  return byId ?? NAME_TO_ALPHA2_OVERRIDES[featureName] ?? null;
}
