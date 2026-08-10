import { cacheLife } from "next/cache";

import type { GeoLocation } from "@/types/location";
import type {
  AirQuality,
  Degradation,
  DegradationReason,
  ForecastConfidence,
  Subsystem,
  WeatherBundle,
} from "@/types/weather";

import * as mock from "./mock";
import {
  buildAstronomy,
  fetchAirQuality,
  fetchForecast,
  fetchForecastConfidence,
  type ForecastPayload,
} from "./openmeteo";

/**
 * The provider seam.
 *
 * Pages and route handlers only ever call the functions in this file, and only
 * ever receive normalised types. Swapping Open-Meteo for another service, or
 * for the bundled fixtures, is a change here and nowhere else.
 *
 * Caching is delegated to Next's `use cache` with the profiles declared in
 * `next.config.ts`, so each subsystem revalidates on its own clock: a current
 * observation every couple of minutes, a daily forecast every half hour.
 */

export interface WeatherProvider {
  readonly name: string;
  forecast(latitude: number, longitude: number, days?: number): Promise<ProviderResult<ForecastPayload>>;
  airQuality(latitude: number, longitude: number): Promise<ProviderResult<AirQuality>>;
  confidence(latitude: number, longitude: number): Promise<ProviderResult<ForecastConfidence>>;
}

export type ProviderResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; reason: DegradationReason; message: string; fetchedAt: string };

/**
 * Subsystems named in `MOCK_FAILURE` fail on purpose. This is how the degraded
 * states get exercised in development and in the end-to-end suite without
 * waiting for a real outage.
 */
const forcedFailures = new Set(
  (process.env.MOCK_FAILURE ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
);

const isForced = (subsystem: Subsystem): boolean => forcedFailures.has(subsystem);

const forcedFailure = <T,>(subsystem: Subsystem): ProviderResult<T> => ({
  ok: false,
  reason: "provider-error",
  message: `Simulated ${subsystem} failure (MOCK_FAILURE).`,
  fetchedAt: new Date().toISOString(),
});

/* -------------------------------------------------------------------------- */
/* Cached reads                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `fetchedAt` is stamped inside the cached function on purpose: it records when
 * the data actually left the provider, not when this render happened, which is
 * what the freshness indicator needs to be truthful about.
 */
async function cachedForecast(
  latitude: number,
  longitude: number,
  days: number,
): Promise<ProviderResult<ForecastPayload>> {
  "use cache";
  cacheLife("hourly");

  const result = await fetchForecast(latitude, longitude, { days });
  const fetchedAt = new Date().toISOString();

  return result.ok
    ? { ok: true, data: result.data, fetchedAt }
    : { ok: false, reason: result.reason, message: result.message, fetchedAt };
}

async function cachedAirQuality(
  latitude: number,
  longitude: number,
): Promise<ProviderResult<AirQuality>> {
  "use cache";
  cacheLife("airQuality");

  const result = await fetchAirQuality(latitude, longitude);
  const fetchedAt = new Date().toISOString();

  return result.ok
    ? { ok: true, data: result.data, fetchedAt }
    : { ok: false, reason: result.reason, message: result.message, fetchedAt };
}

async function cachedConfidence(
  latitude: number,
  longitude: number,
): Promise<ProviderResult<ForecastConfidence>> {
  "use cache";
  cacheLife("daily");

  const result = await fetchForecastConfidence(latitude, longitude);
  const fetchedAt = new Date().toISOString();

  return result.ok
    ? { ok: true, data: result.data, fetchedAt }
    : { ok: false, reason: result.reason, message: result.message, fetchedAt };
}

/* -------------------------------------------------------------------------- */
/* Implementations                                                            */
/* -------------------------------------------------------------------------- */

const openMeteoProvider: WeatherProvider = {
  name: "Open-Meteo",
  forecast: (latitude, longitude, days = 16) =>
    isForced("forecast")
      ? Promise.resolve(forcedFailure<ForecastPayload>("forecast"))
      : cachedForecast(latitude, longitude, days),
  airQuality: (latitude, longitude) =>
    isForced("air-quality")
      ? Promise.resolve(forcedFailure<AirQuality>("air-quality"))
      : cachedAirQuality(latitude, longitude),
  confidence: (latitude, longitude) => cachedConfidence(latitude, longitude),
};

const mockProvider: WeatherProvider = {
  name: "Fixtures",
  forecast: async (latitude, longitude, days = 16) =>
    isForced("forecast")
      ? forcedFailure<ForecastPayload>("forecast")
      : {
          ok: true,
          data: mock.forecastFor(latitude, longitude, days),
          fetchedAt: new Date().toISOString(),
        },
  airQuality: async (latitude, longitude) =>
    isForced("air-quality")
      ? forcedFailure<AirQuality>("air-quality")
      : {
          ok: true,
          data: mock.airQualityFor(latitude, longitude),
          fetchedAt: new Date().toISOString(),
        },
  confidence: async () => ({
    ok: true,
    data: {
      models: ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "gem_seamless"],
      temperatureSpread: 1.8,
      precipitationSpread: 1.2,
      level: "high",
    },
    fetchedAt: new Date().toISOString(),
  }),
};

export const weatherProvider: WeatherProvider =
  process.env.WEATHER_PROVIDER === "mock" ? mockProvider : openMeteoProvider;

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

const degradationFor = (
  subsystem: Subsystem,
  result: Extract<ProviderResult<unknown>, { ok: false }>,
): Degradation => ({
  subsystem,
  reason: result.reason,
  message: result.message,
});

/**
 * Assembles everything the dashboard needs in one pass.
 *
 * The two upstream calls are independent and are issued together; `allSettled`
 * means a failure in either is recorded rather than thrown. Air quality going
 * down darkens the air quality panel and nothing else — the temperature, the
 * forecast and the map all still render.
 */
export async function getWeatherBundle(
  location: GeoLocation,
  { days = 16 }: { days?: number } = {},
): Promise<WeatherBundle> {
  const [forecast, airQuality] = await Promise.allSettled([
    weatherProvider.forecast(location.latitude, location.longitude, days),
    weatherProvider.airQuality(location.latitude, location.longitude),
  ]);

  const degraded: Degradation[] = [];

  // A rejected promise means the guard itself threw, which should not happen —
  // record it as an outage rather than letting it escape.
  const unwrap = <T,>(
    settled: PromiseSettledResult<ProviderResult<T>>,
    subsystem: Subsystem,
  ): { data?: T; fetchedAt?: string } => {
    if (settled.status === "rejected") {
      degraded.push({
        subsystem,
        reason: "provider-error",
        message: "The weather service could not be reached.",
      });
      return {};
    }
    if (!settled.value.ok) {
      degraded.push(degradationFor(subsystem, settled.value));
      return {};
    }
    return { data: settled.value.data, fetchedAt: settled.value.fetchedAt };
  };

  const forecastPart = unwrap(forecast, "forecast");
  const airPart = unwrap(airQuality, "air-quality");

  const payload = forecastPart.data;

  if (payload && !payload.nowcast) {
    degraded.push({
      subsystem: "nowcast",
      reason: "unavailable",
      message: "Minute-level precipitation is not published for this location.",
    });
  }

  // The location's own timezone is authoritative, but a raw-coordinate lookup
  // may not have one until the provider answers.
  const resolved: GeoLocation = payload?.timezone
    ? { ...location, timezone: payload.timezone, elevation: location.elevation ?? payload.elevation }
    : location;

  return {
    location: resolved,
    fetchedAt: forecastPart.fetchedAt ?? new Date().toISOString(),
    current: payload?.current,
    hourly: payload?.hourly ?? [],
    daily: payload?.daily ?? [],
    nowcast: payload?.nowcast,
    airQuality: airPart.data,
    astronomy: payload ? buildAstronomy(resolved, payload.daily) : [],
    degraded,
  };
}

export async function getForecastConfidence(
  location: GeoLocation,
): Promise<ForecastConfidence | undefined> {
  const result = await weatherProvider.confidence(location.latitude, location.longitude);
  return result.ok ? result.data : undefined;
}
