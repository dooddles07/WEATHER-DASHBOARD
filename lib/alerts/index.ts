import { cacheLife } from "next/cache";

import { SEVERITY } from "@/lib/weather/scales";
import type { WeatherAlert } from "@/types/alerts";
import type { GeoLocation } from "@/types/location";
import type { AirQuality, Degradation, HourPoint } from "@/types/weather";

import { deriveAlerts } from "./derived";
import { fetchOfficialAlerts, hasOfficialFeed } from "./official";

export { hasOfficialFeed } from "./official";

export interface AlertsResult {
  alerts: WeatherAlert[];
  /** Populated when an official feed exists but could not be reached. */
  degraded?: Degradation;
  /** True when no agency publishes an open feed for this country. */
  derivedOnly: boolean;
}

async function cachedOfficialAlerts(location: GeoLocation) {
  "use cache";
  cacheLife("alerts");
  return fetchOfficialAlerts(location);
}

/**
 * Official bulletins first, then derived advisories for anything the agency did
 * not already cover.
 *
 * The de-duplication matters: showing an ISOBAR "Strong winds" advisory next to
 * an identical National Weather Service Wind Advisory would imply two
 * independent sources agree, when it is one source and our own arithmetic.
 */
export async function getAlerts(
  location: GeoLocation,
  hours: HourPoint[],
  airQuality?: AirQuality,
): Promise<AlertsResult> {
  const now = Date.now();
  const upcoming = hours
    .filter((hour) => Date.parse(hour.time) >= now)
    .slice(0, 24);

  const derived = deriveAlerts({ location, hours: upcoming, airQuality, now });

  if (!hasOfficialFeed(location.countryCode)) {
    return { alerts: sortAlerts(derived), derivedOnly: true };
  }

  const official = await cachedOfficialAlerts(location);

  if (!official.ok) {
    return {
      alerts: sortAlerts(derived),
      derivedOnly: false,
      degraded: {
        subsystem: "alerts",
        reason: official.reason,
        message: `Official alerts are unavailable right now. ${official.message} Advisories below are derived from forecast data.`,
      },
    };
  }

  const officialCategories = new Set(official.data.map((alert) => alert.category));
  const complementary = derived.filter(
    (alert) => !officialCategories.has(alert.category),
  );

  return {
    alerts: sortAlerts([...official.data, ...complementary]),
    derivedOnly: false,
  };
}

/** Most severe first; official ahead of derived at equal severity. */
function sortAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort((a, b) => {
    const weight = SEVERITY[b.severity].weight - SEVERITY[a.severity].weight;
    if (weight !== 0) return weight;
    if (a.origin !== b.origin) return a.origin === "official" ? -1 : 1;
    return Date.parse(a.effective) - Date.parse(b.effective);
  });
}

/** Alerts in force at a given moment, for the scrubbed timeline. */
export function alertsActiveAt(alerts: WeatherAlert[], instant: number): WeatherAlert[] {
  return alerts.filter((alert) => {
    const from = Date.parse(alert.effective);
    const to = alert.expires ? Date.parse(alert.expires) : Number.POSITIVE_INFINITY;
    return instant >= from && instant <= to;
  });
}
