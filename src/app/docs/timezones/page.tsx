import { H1, Lead, H2, P, UL, Callout } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'Timezone configuration - Rune docs' };

export default function TimezonesPage() {
  return (
    <div>
      <H1>Timezone configuration</H1>
      <Lead>
        Your time zone drives every date/time computation in Rune - what &ldquo;today&rdquo; means, when your working
        day starts and ends, and what the daily digest reports. It&rsquo;s set from a world map, not a short list of
        cities.
      </Lead>

      <H2>Where to set it</H2>
      <P>
        During first-time setup, or any time after from <strong className="text-foreground">Settings &gt; General
        &gt; Time zone &gt; Change</strong>. Either opens the same picker.
      </P>

      <H2>Browsing the map</H2>
      <P>
        The picker shows an interactive world map covering every IANA/Olson time zone - not a hand-picked shortlist.
        Click a country to see every time zone it actually uses. Most countries have exactly one; some - the United
        States, Russia, Australia, Canada - have several, and the picker lists all of them rather than picking one
        for you. A country whose zone(s) include your currently-selected time zone is highlighted on the map, so you
        can see at a glance where your current setting &ldquo;lives.&rdquo; Zoom controls in the corner make small,
        densely-packed regions (the Caribbean, the Balkans, Southeast Asia) easier to hit precisely.
      </P>

      <H2>Searching instead</H2>
      <P>
        Typing in the search box matches country names, city names, and raw zone identifiers at once - searching
        &ldquo;Tokyo&rdquo; finds <code className="font-mono text-primary text-[12.5px]">Asia/Tokyo</code> and shows
        every country that uses it (Japan, and parts of Australia); searching a country name lists all of its zones
        the same way clicking it on the map would.
      </P>

      <H2>Reading a time zone entry</H2>
      <P>Every zone in the list shows, live, right now:</P>
      <UL>
        <li>Its current local clock time.</li>
        <li>Its current UTC offset, e.g. <code className="font-mono text-primary text-[12.5px]">UTC+05:30</code> or <code className="font-mono text-primary text-[12.5px]">UTC-04:00</code>.</li>
      </UL>
      <P>Selecting one immediately shows it in the picker&rsquo;s header, with the same live offset and local time, before you confirm.</P>

      <Callout>
        <strong>Daylight saving is automatic.</strong> Offsets are computed on the fly from your browser&rsquo;s own{' '}
        <code className="font-mono text-primary text-[12.5px]">Intl</code> API for the current moment, using the same
        IANA time zone database every modern browser and Node.js ship and keep updated. There is no separate
        &ldquo;is this zone in DST right now&rdquo; calculation in Rune to get out of date - a zone observing daylight
        saving simply reports its DST offset for &ldquo;now,&rdquo; and reports standard time again once it ends,
        with zero configuration.
      </Callout>

      <H2>Why not just a dropdown</H2>
      <P>
        A short list of major cities is fast to build but leaves out most of the world, and forces people into the
        &ldquo;closest enough&rdquo; city instead of their actual zone. Every IANA zone is one `Intl.supportedValuesOf`
        call away in any modern runtime, so there is no real reason to hand-pick a subset - the map and search are
        just a more usable way to get into that full list than scrolling a 400-option `&lt;select&gt;`.
      </P>

      <DocsPager slug="timezones" />
    </div>
  );
}
