'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { Search, MapPin, Check, ZoomIn, ZoomOut, Globe2 } from 'lucide-react';
import worldAtlas from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { alpha2ForFeature } from '@/lib/timezoneCountries';
import {
  getAllCountries,
  getCountry,
  getCountriesForTimezone,
  currentUtcOffsetLabel,
  currentLocalTimeLabel,
  timezoneCityLabel,
  searchTimezones,
  type TimezoneSearchEntry,
} from '@/lib/timezoneData';

/**
 * A world-map timezone picker: browse or search for a country, see every
 * IANA zone it actually uses (several countries have more than one), and
 * pick the one that's convenient - rather than a flat, hand-picked dropdown
 * of a handful of cities. Offsets and local time are computed live via
 * `Intl`, so daylight saving is always correct for "right now" without any
 * DST logic of our own.
 */

const geoData = feature(
  worldAtlas as unknown as Topology,
  (worldAtlas as unknown as Topology).objects.countries as GeometryCollection
);

interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
  className?: string;
}

export function TimezonePicker({ value, onChange, className = '' }: TimezonePickerProps) {
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(() => {
    const owners = getCountriesForTimezone(value);
    return owners[0] ?? null;
  });
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState(() => new Date());

  // Keep "current local time" labels fresh while the picker is left open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // If `value` changes from outside (e.g. a different saved setting loads
  // in), follow it so the map/list context stays relevant. Adjusted during
  // render (React's own recommended pattern for "reset state when a prop
  // changes") rather than in an effect, so it takes effect in the same
  // render instead of causing an extra one.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const owners = getCountriesForTimezone(value);
    if (owners[0]) setSelectedCountry(owners[0]);
  }

  const selectedTzOwners = useMemo(() => new Set(getCountriesForTimezone(value)), [value]);
  const allCountries = useMemo(() => getAllCountries(), []);
  const countryInfo = selectedCountry ? getCountry(selectedCountry) : null;

  const searchResults: TimezoneSearchEntry[] = useMemo(() => searchTimezones(search), [search]);
  const countryMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allCountries.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, allCountries]);

  const handlePickCountry = (alpha2: string) => {
    setSelectedCountry(alpha2);
    setSearch('');
    // A single-timezone country is an unambiguous pick - select it immediately.
    const info = getCountry(alpha2);
    if (info && info.timezones.length === 1) onChange(info.timezones[0]);
  };

  const isSearching = search.trim().length > 0;

  return (
    <div className={`border border-border rounded-lg overflow-hidden bg-surface ${className}`}>
      {/* Current selection header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Globe2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate font-mono">{value}</p>
            <p className="text-[11px] text-ink-secondary">
              {currentUtcOffsetLabel(value, now)} · {currentLocalTimeLabel(value, now)} right now
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        {/* Map */}
        <div className="relative bg-bg-1 border-b lg:border-b-0 lg:border-r border-border">
          <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-surface border border-border-strong text-ink-secondary hover:text-foreground hover:bg-surface-sunken transition-colors cursor-pointer"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-surface border border-border-strong text-ink-secondary hover:text-foreground hover:bg-surface-sunken transition-colors cursor-pointer"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
          {hoveredName && (
            <div className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-md bg-surface border border-border-strong text-[11px] font-medium text-foreground shadow-[var(--shadow-md)] pointer-events-none">
              {hoveredName}
            </div>
          )}
          <ComposableMap
            projection="geoEqualEarth"
            className="w-full h-[260px] sm:h-[340px] lg:h-[420px]"
            style={{ width: '100%', height: '100%' }}
          >
            <ZoomableGroup zoom={zoom} onMoveEnd={({ zoom: z }) => setZoom(z ?? zoom)} minZoom={1} maxZoom={8}>
              <Geographies geography={geoData}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const name = (geo.properties?.name as string) ?? '';
                    const alpha2 = alpha2ForFeature(geo.id, name);
                    const isSelected = alpha2 === selectedCountry;
                    const hasSelectedTz = !!alpha2 && selectedTzOwners.has(alpha2);
                    const isHovered = hoveredName === name;
                    const fill = isSelected
                      ? 'var(--primary)'
                      : isHovered
                        ? 'var(--primary-hover)'
                        : hasSelectedTz
                          ? 'var(--primary-soft)'
                          : 'var(--surface-raised)';
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => setHoveredName(name)}
                        onMouseLeave={() => setHoveredName(null)}
                        onClick={() => alpha2 && handlePickCountry(alpha2)}
                        style={{
                          fill,
                          stroke: 'var(--border-strong)',
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: alpha2 ? 'pointer' : 'default',
                          transition: 'fill 120ms ease-out',
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Search + timezone list */}
        <div className="flex flex-col min-h-[260px] lg:min-h-[420px] max-h-[420px]">
          <div className="p-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a country or city…"
                className="w-full bg-surface-sunken border border-border rounded-md pl-8 pr-3 py-2 text-[13px] text-foreground placeholder-ink-faint focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isSearching ? (
              <>
                {countryMatches.length > 0 && (
                  <div className="mb-2">
                    <p className="px-2 py-1 text-[11.5px] font-semibold text-ink-faint">Countries</p>
                    {countryMatches.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handlePickCountry(c.code)}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left hover:bg-surface-sunken transition-colors cursor-pointer"
                      >
                        <span className="text-[13px] text-foreground">{c.name}</span>
                        <span className="text-[10.5px] text-ink-faint font-mono">{c.timezones.length} zone{c.timezones.length !== 1 ? 's' : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="px-2 py-1 text-[11.5px] font-semibold text-ink-faint">Timezones</p>
                {searchResults.length === 0 && countryMatches.length === 0 ? (
                  <p className="px-2.5 py-4 text-[12.5px] text-ink-faint text-center">No matches. Try a country, city, or continent.</p>
                ) : (
                  searchResults.map((entry) => (
                    <TimezoneRow key={entry.tz} tz={entry.tz} subtitle={entry.countryNames.join(', ')} selected={entry.tz === value} onSelect={onChange} now={now} />
                  ))
                )}
              </>
            ) : selectedCountry && countryInfo ? (
              <>
                <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-ink-faint" />
                  <p className="text-[12.5px] font-semibold text-foreground">{countryInfo.name}</p>
                  <span className="ml-auto text-[10.5px] text-ink-faint font-mono">
                    {countryInfo.timezones.length} zone{countryInfo.timezones.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {countryInfo.timezones.map((tz) => (
                  <TimezoneRow key={tz} tz={tz} selected={tz === value} onSelect={onChange} now={now} />
                ))}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4 py-8">
                <Globe2 className="w-6 h-6 text-ink-faint" strokeWidth={1.5} />
                <p className="text-[12px] text-ink-faint leading-relaxed">Click a country on the map, or search for one above.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimezoneRow({
  tz,
  subtitle,
  selected,
  onSelect,
  now,
}: {
  tz: string;
  subtitle?: string;
  selected: boolean;
  onSelect: (tz: string) => void;
  now: Date;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tz)}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer ${
        selected ? 'bg-primary-soft' : 'hover:bg-surface-sunken'
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-[13px] truncate ${selected ? 'text-primary font-semibold' : 'text-foreground'}`}>
          {timezoneCityLabel(tz)}
        </span>
        <span className="block text-[10.5px] text-ink-faint truncate font-mono">{subtitle || tz}</span>
      </span>
      <span className="shrink-0 flex items-center gap-1.5 text-[11px] text-ink-secondary font-mono tabular-nums">
        {currentLocalTimeLabel(tz, now)}
        <span className="text-ink-faint">{currentUtcOffsetLabel(tz, now)}</span>
        {selected && <Check className="w-3.5 h-3.5 text-primary" />}
      </span>
    </button>
  );
}
