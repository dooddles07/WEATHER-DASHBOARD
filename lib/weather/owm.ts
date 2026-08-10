import { z } from "zod";

import { fetchJson, type GuardResult } from "@/server/weather/fetchWithGuard";
import type { GeoLocation } from "@/types/location";

/**
 * OpenWeatherMap adapter.
 *
 * Used for two things Open-Meteo does not cover: reverse geocoding (turning
 * "locate me" coordinates into a place name) and postal-code lookup. It also
 * supplies the raster overlay tiles for the map.
 *
 * The API key is read here and never leaves the server. Tile URLs are built
 * against our own proxy route rather than OpenWeatherMap's host precisely so
 * the key stays out of the browser — see `app/api/tiles/owm`.
 */

const GEO_HOST = "https://api.openweathermap.org/geo/1.0";

export const OWM_LAYERS = {
  temperature: "temp_new",
  precipitation: "precipitation_new",
  wind: "wind_new",
  pressure: "pressure_new",
  clouds: "clouds_new",
} as const;

export type OwmLayerId = keyof typeof OWM_LAYERS;

export const isOwmLayer = (value: string): value is OwmLayerId =>
  Object.hasOwn(OWM_LAYERS, value);

/** Server-side only. Callers must never send the result to the client. */
export const owmApiKey = (): string | undefined => {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  return key ? key : undefined;
};

export const isOwmConfigured = (): boolean => owmApiKey() !== undefined;

const ReverseResponse = z.array(
  z.object({
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
    country: z.string().optional(),
    state: z.string().optional(),
  }),
);

const ZipResponse = z.object({
  zip: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  country: z.string().optional(),
});

const slugify = (name: string, country: string) =>
  `${name}-${country}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The timezone is resolved by the forecast call rather than guessed here, so a
 * reverse-geocoded location starts with UTC and is corrected as soon as the
 * provider answers.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GuardResult<GeoLocation>> {
  const key = owmApiKey();
  if (!key) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Reverse geocoding is not configured.",
      latencyMs: 0,
    };
  }

  const url = `${GEO_HOST}/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${key}`;
  const result = await fetchJson(url, {
    subsystem: "geocoding",
    schema: ReverseResponse,
    revalidate: 86400,
  });

  if (!result.ok) return result;

  const first = result.data[0];
  if (!first) {
    return {
      ok: false,
      reason: "unavailable",
      message: "No named place was found at those coordinates.",
      latencyMs: result.latencyMs,
    };
  }

  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      id: `at:${latitude.toFixed(3)},${longitude.toFixed(3)}`,
      name: first.name,
      country: first.country ?? "",
      countryCode: first.country ?? "",
      admin1: first.state,
      latitude,
      longitude,
      timezone: "UTC",
      slug: slugify(first.name, first.country ?? ""),
    },
  };
}

/** Postal-code lookup, which the Open-Meteo gazetteer does not offer. */
export async function geocodePostalCode(
  postalCode: string,
  countryCode: string,
): Promise<GuardResult<GeoLocation>> {
  const key = owmApiKey();
  if (!key) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Postal code search is not configured.",
      latencyMs: 0,
    };
  }

  const url = `${GEO_HOST}/zip?zip=${encodeURIComponent(postalCode)},${encodeURIComponent(countryCode)}&appid=${key}`;
  const result = await fetchJson(url, {
    subsystem: "geocoding",
    schema: ZipResponse,
    revalidate: 86400,
  });

  if (!result.ok) return result;

  const place = result.data;
  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      id: `zip:${place.country ?? countryCode}:${place.zip}`,
      name: place.name,
      country: place.country ?? countryCode,
      countryCode: place.country ?? countryCode,
      latitude: place.lat,
      longitude: place.lon,
      timezone: "UTC",
      slug: slugify(place.name, place.country ?? countryCode),
    },
  };
}

/** The upstream tile URL. Only ever called from inside the proxy route. */
export const owmTileUrl = (
  layer: OwmLayerId,
  z: number,
  x: number,
  y: number,
  key: string,
): string => `https://tile.openweathermap.org/map/${OWM_LAYERS[layer]}/${z}/${x}/${y}.png?appid=${key}`;
