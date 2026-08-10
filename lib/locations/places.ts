import type { GeoLocation } from "@/types/location";

/**
 * Location constants and helpers that both halves of the app need.
 *
 * Kept separate from `./selection.ts` deliberately: that module reads cookies
 * and is therefore server-only, and a client component importing a helper from
 * it would drag `next/headers` into the browser bundle. This file has no
 * runtime dependencies at all.
 */

export const LOCATION_COOKIE = "isobar-location";

/**
 * Shown to anyone who has not chosen a place yet. A dashboard that opens on a
 * real city is far more useful than one that opens on an empty prompt, and the
 * search is one keystroke away.
 */
export const DEFAULT_LOCATION: GeoLocation = {
  id: "openmeteo:1701668",
  name: "Manila",
  country: "Philippines",
  countryCode: "PH",
  admin1: "Metro Manila",
  latitude: 14.6042,
  longitude: 120.9822,
  timezone: "Asia/Manila",
  population: 1600000,
  slug: "manila-philippines",
};

/** Quick picks for the empty search field and the comparison page. */
export const SUGGESTED_LOCATIONS: readonly GeoLocation[] = [
  DEFAULT_LOCATION,
  {
    id: "openmeteo:1850147",
    name: "Tokyo",
    country: "Japan",
    countryCode: "JP",
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: "Asia/Tokyo",
    slug: "tokyo-japan",
  },
  {
    id: "openmeteo:5128581",
    name: "New York",
    country: "United States",
    countryCode: "US",
    admin1: "New York",
    latitude: 40.7143,
    longitude: -74.006,
    timezone: "America/New_York",
    slug: "new-york-united-states",
  },
  {
    id: "openmeteo:2643743",
    name: "London",
    country: "United Kingdom",
    countryCode: "GB",
    admin1: "England",
    latitude: 51.5085,
    longitude: -0.1257,
    timezone: "Europe/London",
    slug: "london-united-kingdom",
  },
  {
    id: "openmeteo:1880252",
    name: "Singapore",
    country: "Singapore",
    countryCode: "SG",
    latitude: 1.28967,
    longitude: 103.85007,
    timezone: "Asia/Singapore",
    slug: "singapore-singapore",
  },
  {
    id: "openmeteo:2147714",
    name: "Sydney",
    country: "Australia",
    countryCode: "AU",
    admin1: "New South Wales",
    latitude: -33.86785,
    longitude: 151.20732,
    timezone: "Australia/Sydney",
    slug: "sydney-australia",
  },
  {
    id: "openmeteo:292223",
    name: "Dubai",
    country: "United Arab Emirates",
    countryCode: "AE",
    latitude: 25.07725,
    longitude: 55.30927,
    timezone: "Asia/Dubai",
    slug: "dubai-united-arab-emirates",
  },
];

/** Serialises a location for the cookie. Shared so the shapes cannot drift. */
export const encodeLocationCookie = (location: GeoLocation): string =>
  encodeURIComponent(JSON.stringify(location));

/**
 * `Manila, Metro Manila, Philippines` — the fullest unambiguous description,
 * skipping the region when it merely repeats the city name.
 */
export function describeLocation(location: GeoLocation): string {
  const parts = [location.name];
  if (location.admin1 && location.admin1 !== location.name) parts.push(location.admin1);
  if (location.country) parts.push(location.country);
  return parts.join(", ");
}
