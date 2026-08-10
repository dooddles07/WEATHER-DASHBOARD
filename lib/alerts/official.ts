import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import type { SeverityLevel } from "@/lib/weather/scales";
import { fetchJson, fetchText, type GuardResult } from "@/server/weather/fetchWithGuard";
import type { AlertCategory, WeatherAlert } from "@/types/alerts";
import type { GeoLocation } from "@/types/location";

/**
 * Official alert feeds.
 *
 * Two agencies publish free, open warning data with worldwide-usable licences:
 * the US National Weather Service, and MeteoAlarm for the European national
 * meteorological services. Everywhere else falls through to the derived
 * advisories in `./derived.ts`, clearly labelled as such.
 */

/* -------------------------------------------------------------------------- */
/* Shared mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Agencies name the tier in the event title far more reliably than they set the
 * CAP severity field, so the title wins where it is explicit.
 */
function severityFromEvent(event: string, capSeverity?: string): SeverityLevel {
  const name = event.toLowerCase();
  if (name.includes("emergency")) return "emergency";
  if (name.includes("warning")) return "warning";
  if (name.includes("watch")) return "watch";
  if (name.includes("advisory")) return "advisory";
  if (name.includes("statement") || name.includes("outlook")) return "information";

  switch (capSeverity?.toLowerCase()) {
    case "extreme":
      return "emergency";
    case "severe":
      return "warning";
    case "moderate":
      return "watch";
    case "minor":
      return "advisory";
    default:
      return "information";
  }
}

const CATEGORY_PATTERNS: ReadonlyArray<[RegExp, AlertCategory]> = [
  [/hurricane|typhoon|tropical (storm|depression|cyclone)/i, "tropical-cyclone"],
  [/tornado|thunderstorm|squall/i, "thunderstorm"],
  [/flood|flash flood|coastal flood/i, "flood"],
  [/rain|rainfall/i, "rain"],
  [/heat|hot/i, "heat"],
  [/freeze|frost|cold|chill|wind chill/i, "cold"],
  [/wind|gale/i, "wind"],
  [/lightning/i, "lightning"],
  [/air quality|smoke|dust/i, "air-quality"],
  [/fog/i, "fog"],
  [/snow|ice|blizzard|winter|sleet|avalanche/i, "snow-ice"],
  [/marine|small craft|surf|rip current/i, "marine"],
];

const categoryFor = (event: string): AlertCategory =>
  CATEGORY_PATTERNS.find(([pattern]) => pattern.test(event))?.[1] ?? "other";

/* -------------------------------------------------------------------------- */
/* United States — api.weather.gov                                            */
/* -------------------------------------------------------------------------- */

const NwsResponse = z.object({
  features: z
    .array(
      z.object({
        id: z.string(),
        properties: z.object({
          event: z.string(),
          headline: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          instruction: z.string().nullable().optional(),
          severity: z.string().nullable().optional(),
          areaDesc: z.string().nullable().optional(),
          effective: z.string().nullable().optional(),
          expires: z.string().nullable().optional(),
          senderName: z.string().nullable().optional(),
        }),
      }),
    )
    .default([]),
});

export async function fetchNwsAlerts(
  location: GeoLocation,
): Promise<GuardResult<WeatherAlert[]>> {
  // The API rejects coordinates with excessive precision.
  const point = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
  const url = `https://api.weather.gov/alerts/active?point=${encodeURIComponent(point)}`;

  const result = await fetchJson(url, {
    subsystem: "alerts",
    schema: NwsResponse,
    revalidate: 120,
    headers: { accept: "application/geo+json" },
  });

  if (!result.ok) return result;

  const alerts: WeatherAlert[] = result.data.features.map((feature) => {
    const properties = feature.properties;
    return {
      id: feature.id,
      origin: "official" as const,
      source: properties.senderName ?? "US National Weather Service",
      severity: severityFromEvent(properties.event, properties.severity ?? undefined),
      category: categoryFor(properties.event),
      headline: properties.headline ?? properties.event,
      description: properties.description ?? "",
      instruction: properties.instruction ?? undefined,
      areas: (properties.areaDesc ?? "").split(";").map((area) => area.trim()).filter(Boolean),
      effective: properties.effective ?? new Date().toISOString(),
      expires: properties.expires ?? undefined,
      url: feature.id.startsWith("http") ? feature.id : undefined,
    };
  });

  return { ok: true, data: alerts, latencyMs: result.latencyMs };
}

/* -------------------------------------------------------------------------- */
/* Europe — MeteoAlarm                                                        */
/* -------------------------------------------------------------------------- */

/** Countries with a MeteoAlarm feed, by ISO 3166-1 alpha-2 code. */
const METEOALARM_COUNTRIES: Record<string, string> = {
  AT: "austria", BA: "bosnia-herzegovina", BE: "belgium", BG: "bulgaria",
  CH: "switzerland", CY: "cyprus", CZ: "czechia", DE: "germany",
  DK: "denmark", EE: "estonia", ES: "spain", FI: "finland",
  FR: "france", GR: "greece", HR: "croatia", HU: "hungary",
  IE: "ireland", IL: "israel", IS: "iceland", IT: "italy",
  LT: "lithuania", LU: "luxembourg", LV: "latvia", MD: "moldova",
  ME: "montenegro", MK: "north-macedonia", MT: "malta", NL: "netherlands",
  NO: "norway", PL: "poland", PT: "portugal", RO: "romania",
  RS: "serbia", SE: "sweden", SI: "slovenia", SK: "slovakia",
  UA: "ukraine", GB: "united-kingdom",
};

export const hasOfficialFeed = (countryCode: string): boolean =>
  countryCode === "US" || countryCode in METEOALARM_COUNTRIES;

/**
 * MeteoAlarm publishes per-country Atom feeds carrying CAP payloads. The feed
 * is national rather than point-based, so entries are matched to the location
 * by area name — coarse, and stated as such in the UI.
 */
export async function fetchMeteoAlarmAlerts(
  location: GeoLocation,
): Promise<GuardResult<WeatherAlert[]>> {
  const country = METEOALARM_COUNTRIES[location.countryCode];
  if (!country) {
    return {
      ok: false,
      reason: "not-configured",
      message: "No official alert feed is published for this country.",
      latencyMs: 0,
    };
  }

  const result = await fetchText(
    `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${country}`,
    { subsystem: "alerts", revalidate: 120, headers: { accept: "application/atom+xml" } },
  );

  if (!result.ok) return result;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
  });

  let document: unknown;
  try {
    document = parser.parse(result.data);
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: "The European alert feed could not be read.",
      latencyMs: result.latencyMs,
    };
  }

  const FeedShape = z.object({
    feed: z
      .object({
        entry: z
          .union([z.array(z.unknown()), z.unknown()])
          .optional(),
      })
      .optional(),
  });

  const parsed = FeedShape.safeParse(document);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "malformed",
      message: "The European alert feed could not be read.",
      latencyMs: result.latencyMs,
    };
  }

  const rawEntries = parsed.data.feed?.entry;
  const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

  const EntryShape = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    summary: z.union([z.string(), z.object({ "#text": z.string() })]).optional(),
    link: z.union([z.object({ "@href": z.string() }), z.array(z.unknown())]).optional(),
    event: z.string().optional(),
    severity: z.string().optional(),
    areaDesc: z.string().optional(),
    effective: z.string().optional(),
    onset: z.string().optional(),
    expires: z.string().optional(),
    description: z.string().optional(),
    instruction: z.string().optional(),
  });

  const region = (location.admin1 ?? "").toLowerCase();

  const alerts: WeatherAlert[] = entries.flatMap((entry, index) => {
    const candidate = EntryShape.safeParse(entry);
    if (!candidate.success) return [];

    const value = candidate.data;
    const event = value.event ?? value.title ?? "Weather warning";
    const areaDesc = value.areaDesc ?? "";

    // The feed covers a whole country; keep entries whose area plausibly
    // matches, or all of them when we have no region to match against.
    if (region && areaDesc && !areaDesc.toLowerCase().includes(region)) return [];

    const summary =
      typeof value.summary === "string" ? value.summary : value.summary?.["#text"];

    return [
      {
        id: `meteoalarm:${String(value.id ?? index)}`,
        origin: "official" as const,
        source: "MeteoAlarm — European national meteorological services",
        severity: severityFromEvent(event, value.severity),
        category: categoryFor(event),
        headline: value.title ?? event,
        description: value.description ?? summary ?? "",
        instruction: value.instruction,
        areas: areaDesc ? areaDesc.split(",").map((area) => area.trim()) : [location.name],
        effective: value.onset ?? value.effective ?? new Date().toISOString(),
        expires: value.expires,
        url:
          value.link && !Array.isArray(value.link) ? value.link["@href"] : "https://meteoalarm.org",
      },
    ];
  });

  return { ok: true, data: alerts, latencyMs: result.latencyMs };
}

/** Routes to whichever agency covers the location, if any. */
export async function fetchOfficialAlerts(
  location: GeoLocation,
): Promise<GuardResult<WeatherAlert[]>> {
  if (location.countryCode === "US") return fetchNwsAlerts(location);
  if (location.countryCode in METEOALARM_COUNTRIES) return fetchMeteoAlarmAlerts(location);

  return {
    ok: false,
    reason: "not-configured",
    message: "No official weather agency publishes an open alert feed for this country.",
    latencyMs: 0,
  };
}
