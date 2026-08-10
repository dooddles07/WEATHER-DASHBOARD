# ISOBAR — where we left off

Weather intelligence platform. Full plan lives at
`~/.claude/plans/frontend-design-frontend-design-21st-de-eager-kay.md`.

## State

Typecheck clean. 72 unit tests pass, plus 6 live provider contract tests
(opt-in). Nothing is half-written — every file committed compiles and is
covered or exercised.

## Done

**Foundation.** Next.js 16.3 (App Router, React 19.2, Turbopack), TypeScript
strict with `noUnusedLocals`/`noUnusedParameters`, Tailwind v4. Cache
Components enabled with ten named `cacheLife` profiles, one per weather
subsystem. CSP and security headers set; `unsafe-eval` is scoped to
development only.

**Design system.** `app/globals.css` holds the ISOBAR token layer. The
governing rule is *chrome is achromatic, colour is data* — the shell only uses
the `--ink-*` graphite ramp, and every hue on screen encodes a measurement.
Interaction is signalled by contrast, not colour. Archivo (variable, `wdth`
axis) carries display and body; Martian Mono is reserved for measured values.
Light and dark are designed separately.

**Data layer.** Provider abstraction over Open-Meteo with fixtures and a
forced-failure mode. Normalised schema — nothing downstream sees a provider
shape. Times are epoch-based and rendered through the location's IANA zone.
Resilience wrapper gives every upstream call a timeout, one retry, a circuit
breaker and zod validation, and returns failures as values so one dead
subsystem darkens one panel.

**Derived intelligence.** Sun and moon ephemeris computed locally (validated
against published almanac values to within three minutes). EPA air quality
sub-indices. Activity scores that show their working. Insights generated only
where data supports them. Derived advisories for the ~90% of the world with no
open official alert feed, clearly separated from NWS and MeteoAlarm bulletins.

## Next, in order

1. Remaining route handlers: `/api/geo/reverse`, `/api/radar/index`,
   `/api/alerts`, `/api/wind-field`.
2. `lib/alerts/storms.ts` — NOAA NHC `CurrentStorms.json` plus KMZ track and
   cone parsing (`fflate` is already installed for the unzip).
3. App shell: command bar, ⌘K location search, desktop nav, mobile bottom nav,
   preferences store, skeletons, error boundaries.
4. The signature — `AtmosphericRibbon` and the global scrub store, then the
   dashboard reading `valueAt(t)`.
5. Map and radar, severe weather centre, remaining routes, production pass.

## Running it

```bash
npm run dev
```

Works with no configuration. `.env.local` holds the OpenWeatherMap key, which
only unlocks the extra map overlay layers and postal-code search.

To exercise degraded states, set `WEATHER_PROVIDER=mock` and any of
`MOCK_FAILURE=forecast,air-quality,alerts,radar` in `.env.local`.

Live provider contract tests:

```bash
LIVE_PROVIDER_TESTS=1 npx vitest run openmeteo.live
```

## One outstanding action

The OpenWeatherMap key was shared in chat and is therefore in a transcript.
It is gitignored and proxied so it never reaches the browser, but it should be
rotated at openweathermap.org.
