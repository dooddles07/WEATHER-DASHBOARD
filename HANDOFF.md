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

**Map and radar.** Lazy-loaded MapLibre on OpenFreeMap tiles, RainViewer's
animated radar with a scrubbing timeline that distinguishes observed frames
from the nowcast, and the OpenWeatherMap model layers proxied so the key never
reaches the browser (verified: twelve tile requests, no credential in any of
them). The legend states whether a layer is observation or model output.

**Compare and history.** `/compare` puts up to five cities side by side from a
single batched upstream request, marking the highest and lowest value in each
row with an arrow as well as weight. `/history` charts ninety days of ERA5
reanalysis and states today's anomaly against a ten-year climate normal, with
the baseline and sample size shown alongside it.

## Next, in order

1. `lib/alerts/storms.ts` — NOAA NHC `CurrentStorms.json` plus KMZ track and
   cone parsing; `fflate` is installed for the unzip.
2. Public `/weather/[slug]` SEO pages, PWA, Playwright + axe, Lighthouse, and
   the §69 documents.

## MapLibre's worker

`scripts/copy-maplibre-worker.mjs` copies MapLibre's worker chunks into
`public/maplibre/` before dev and build, and the map calls `setWorkerUrl` to
point at them. Turbopack does not emit those chunks, so the worker request
falls through to the app's HTML; MapLibre then hangs with no error and no
`load` event, which is a genuinely confusing failure to diagnose. The copy is
gitignored and regenerated from whatever version is installed.

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
