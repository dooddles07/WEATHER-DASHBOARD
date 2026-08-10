# ISOBAR — where we left off

Weather intelligence platform. Full plan at
`~/.claude/plans/frontend-design-frontend-design-21st-de-eager-kay.md`.

## State

Running on live data. `npx tsc --noEmit` clean, 72 unit tests passing plus 6
opt-in live provider contract tests. Dashboard, Forecast, Alerts, Locations and
Settings all render and were verified in the browser.

## Running it

```bash
npm run dev
```

Works with no configuration. `.env.local` holds the OpenWeatherMap key, which
only unlocks the extra map overlay layers and postal-code search.

**The dev/build/start scripts run Node with `--use-system-ca`.** This machine
has TLS interception, so Node's bundled CA list cannot verify the chain to
Open-Meteo and every request fails with `unable to verify the first
certificate`. The flag makes Node trust the Windows certificate store, which is
where the interceptor's root already is. It is a no-op on machines without
interception, so it is safe to keep.

Degraded-state testing:

```bash
WEATHER_PROVIDER=mock MOCK_FAILURE=air-quality,alerts npm run dev
```

Live provider contract tests:

```bash
LIVE_PROVIDER_TESTS=1 npx vitest run openmeteo.live
```

## Done

**Foundation.** Next.js 16.3 (App Router, React 19.2, Turbopack), strict
TypeScript, Tailwind v4. Cache Components with ten named `cacheLife` profiles,
one per weather subsystem. CSP and security headers, with `unsafe-eval` scoped
to development.

**Design system.** The governing rule is *chrome is achromatic, colour is
data* — the shell uses only the graphite ramp, and every hue on screen encodes
a measurement. Interaction is signalled by contrast, never hue. Archivo carries
display and body with width encoding importance; Martian Mono is reserved for
measured values. The wordmark's isobar contours are tinted by the live
temperature of the place being viewed.

**Data layer.** Provider abstraction over Open-Meteo with fixtures and a
forced-failure mode. Normalised schema — nothing downstream sees a provider
shape. Times are epoch-based and rendered through each location's IANA zone.
Every upstream call gets a timeout, one retry, a circuit breaker and zod
validation, and failures return as values so one dead subsystem darkens one
panel.

**Derived intelligence.** Sun and moon ephemeris computed locally (validated
against published almanac values to within three minutes). EPA air-quality
sub-indices. Activity scores that show every deduction. Insights that only fire
when data supports them. Derived advisories for the ~90% of the world with no
open official feed, kept visually and textually distinct from NWS and MeteoAlarm
bulletins.

**The signature.** The Atmospheric Ribbon: one 48-hour strip carrying
temperature, precipitation, daylight and sun events, with a playhead that
retimes the whole dashboard. Drag it and the wind compass, UV band, air quality,
sun position and activity scores all describe the scrubbed moment.

## Next, in order

1. `/map` and `/radar` — lazy MapLibre + OpenFreeMap, RainViewer animated loop,
   OWM overlay layers through the existing tile proxy. Add both to
   `components/navigation/routes.ts` once they exist.
2. `/compare` (the batched preview endpoint already supports it) and `/history`
   (the archive and climate-normal adapters are already written).
3. `lib/alerts/storms.ts` — NOAA NHC `CurrentStorms.json` plus KMZ track and
   cone parsing; `fflate` is installed for the unzip.
4. Public `/weather/[slug]` SEO pages, PWA, Playwright + axe, Lighthouse, and
   the §69 documents.

## Known issues

- The Next dev overlay can replay a stale compile error after its HMR socket
  drops — file watching on OneDrive is unreliable. If an error looks impossible,
  check the server log; a restart clears it.
- Precipitation bars in the ribbon read as a near-continuous band in persistently
  wet climates. Worth revisiting the intensity scale.

## One outstanding action

The OpenWeatherMap key was shared in chat and is therefore in a transcript. It
is gitignored and proxied so it never reaches the browser, but it should be
rotated at openweathermap.org.
