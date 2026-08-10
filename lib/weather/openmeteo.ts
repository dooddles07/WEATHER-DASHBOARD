import { z } from "zod";

import { fromUnixSeconds, localDateKey } from "@/lib/time";
import { precipitationIntensity } from "@/lib/weather/scales";
import {
  moonPhase,
  moonRiseSet,
  solarNoon,
  sunRiseSet,
  utcInstantForLocal,
} from "@/lib/weather/solar";
import { conditionFromCode } from "@/lib/weather/wmo";
import { fetchJson, type GuardResult } from "@/server/weather/fetchWithGuard";
import type { GeoLocation } from "@/types/location";
import type {
  AirQuality,
  Astronomy,
  ClimateNormal,
  CurrentWeather,
  DayPoint,
  ForecastConfidence,
  HistoricalObservation,
  HourPoint,
  NowcastStep,
  PrecipitationNowcast,
} from "@/types/weather";

/**
 * The Open-Meteo adapter — the only file in the app that knows what Open-Meteo
 * responses look like. Everything it exports is already in the normalised
 * schema.
 *
 * Two decisions shape the requests:
 *
 * 1. `timeformat=unixtime`. Asking for ISO strings gets naive local wall-clock
 *    times with no offset, which are ambiguous across DST transitions. Epoch
 *    seconds are unambiguous, and `lib/time` renders them in the location's
 *    zone.
 * 2. `timezone=auto`. Daily aggregates must be bucketed by the location's own
 *    midnight, not UTC's, or "tomorrow's high" belongs to the wrong day.
 */

const FORECAST_HOST = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_HOST = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODING_HOST = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE_HOST = "https://archive-api.open-meteo.com/v1/archive";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Values come back as `null` wherever a model has no data for a point. The
 * schema accepts that rather than rejecting the whole response, because one
 * missing pollutant should never cost the user their temperature.
 */
const values = z.array(z.number().nullable()).default([]);
const times = z.array(z.number()).default([]);

const ForecastResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  elevation: z.number().nullable().optional(),
  current: z
    .object({
      time: z.number(),
      temperature_2m: z.number().nullable().optional(),
      relative_humidity_2m: z.number().nullable().optional(),
      apparent_temperature: z.number().nullable().optional(),
      is_day: z.number().nullable().optional(),
      precipitation: z.number().nullable().optional(),
      weather_code: z.number().nullable().optional(),
      cloud_cover: z.number().nullable().optional(),
      pressure_msl: z.number().nullable().optional(),
      wind_speed_10m: z.number().nullable().optional(),
      wind_direction_10m: z.number().nullable().optional(),
      wind_gusts_10m: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: times,
      temperature_2m: values,
      relative_humidity_2m: values,
      dew_point_2m: values,
      apparent_temperature: values,
      precipitation_probability: values,
      precipitation: values,
      rain: values,
      showers: values,
      snowfall: values,
      weather_code: values,
      pressure_msl: values,
      cloud_cover: values,
      visibility: values,
      wind_speed_10m: values,
      wind_direction_10m: values,
      wind_gusts_10m: values,
      uv_index: values,
      is_day: values,
      cape: values,
      freezing_level_height: values,
    })
    .optional(),
  daily: z
    .object({
      time: times,
      weather_code: values,
      temperature_2m_max: values,
      temperature_2m_min: values,
      apparent_temperature_max: values,
      apparent_temperature_min: values,
      sunrise: times,
      sunset: times,
      daylight_duration: values,
      sunshine_duration: values,
      uv_index_max: values,
      precipitation_sum: values,
      rain_sum: values,
      snowfall_sum: values,
      precipitation_hours: values,
      precipitation_probability_max: values,
      wind_speed_10m_max: values,
      wind_gusts_10m_max: values,
      wind_direction_10m_dominant: values,
    })
    .optional(),
  minutely_15: z
    .object({
      time: times,
      precipitation: values,
    })
    .optional(),
});

const AirQualityResponse = z.object({
  current: z
    .object({
      time: z.number(),
      us_aqi: z.number().nullable().optional(),
      european_aqi: z.number().nullable().optional(),
      pm10: z.number().nullable().optional(),
      pm2_5: z.number().nullable().optional(),
      carbon_monoxide: z.number().nullable().optional(),
      nitrogen_dioxide: z.number().nullable().optional(),
      sulphur_dioxide: z.number().nullable().optional(),
      ozone: z.number().nullable().optional(),
      dust: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: times,
      us_aqi: values,
      pm2_5: values,
      pm10: values,
      ozone: values,
      nitrogen_dioxide: values,
      alder_pollen: values,
      birch_pollen: values,
      grass_pollen: values,
      mugwort_pollen: values,
      olive_pollen: values,
      ragweed_pollen: values,
    })
    .optional(),
});

const GeocodingResponse = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        elevation: z.number().nullable().optional(),
        timezone: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        country_code: z.string().nullable().optional(),
        admin1: z.string().nullable().optional(),
        admin2: z.string().nullable().optional(),
        population: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

const ArchiveResponse = z.object({
  timezone: z.string().default("UTC"),
  daily: z
    .object({
      time: times,
      temperature_2m_max: values,
      temperature_2m_min: values,
      temperature_2m_mean: values,
      precipitation_sum: values,
      wind_speed_10m_max: values,
      pressure_msl_mean: values,
      relative_humidity_2m_mean: values,
    })
    .optional(),
});

/** Model comparison responses suffix every field with the model name. */
const ModelSpreadResponse = z.looseObject({ daily: z.looseObject({ time: times }).optional() });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const at = (list: Array<number | null> | undefined, index: number): number | undefined => {
  const value = list?.[index];
  return value === null || value === undefined ? undefined : value;
};

/**
 * Open-Meteo's 15-minute product is only genuine radar-derived nowcast data
 * inside the ICON-D2 (Central Europe) and HRRR (North America) domains.
 * Everywhere else the same field is interpolated from the hourly forecast, so
 * the UI must not imply minute-level precision. Checking the domain bounds is
 * the only honest way to tell the two apart from the response alone.
 */
export function hasNativeNowcast(latitude: number, longitude: number): boolean {
  const inIconD2 =
    latitude >= 43.18 && latitude <= 58.08 && longitude >= -3.94 && longitude <= 20.34;
  const inHrrr =
    latitude >= 21.1 && latitude <= 52.6 && longitude >= -134.1 && longitude <= -60.9;
  return inIconD2 || inHrrr;
}

const slugify = (name: string, country: string): string =>
  `${name}-${country}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const search = (params: Record<string, string | number | undefined>): string =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");

const HOURLY_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "pressure_msl",
  "cloud_cover",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "uv_index",
  "is_day",
  "cape",
  "freezing_level_height",
].join(",");

const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "sunrise",
  "sunset",
  "daylight_duration",
  "sunshine_duration",
  "uv_index_max",
  "precipitation_sum",
  "rain_sum",
  "snowfall_sum",
  "precipitation_hours",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
].join(",");

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
].join(",");

/* -------------------------------------------------------------------------- */
/* Forecast                                                                   */
/* -------------------------------------------------------------------------- */

export interface ForecastPayload {
  current?: CurrentWeather;
  hourly: HourPoint[];
  daily: DayPoint[];
  nowcast?: PrecipitationNowcast;
  timezone: string;
  elevation?: number;
}

export async function fetchForecast(
  latitude: number,
  longitude: number,
  { days = 16 }: { days?: number } = {},
): Promise<GuardResult<ForecastPayload>> {
  const url = `${FORECAST_HOST}?${search({
    latitude,
    longitude,
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: days,
    past_days: 1,
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    minutely_15: "precipitation",
  })}`;

  const result = await fetchJson(url, {
    subsystem: "forecast",
    schema: ForecastResponse,
    revalidate: 600,
  });

  if (!result.ok) return result;

  const raw = result.data;

  const current: CurrentWeather | undefined = raw.current
    ? {
        observedAt: fromUnixSeconds(raw.current.time),
        isDay: (raw.current.is_day ?? 1) === 1,
        temperature: raw.current.temperature_2m ?? 0,
        feelsLike: raw.current.apparent_temperature ?? raw.current.temperature_2m ?? 0,
        humidity: raw.current.relative_humidity_2m ?? undefined,
        pressure: raw.current.pressure_msl ?? undefined,
        cloudCover: raw.current.cloud_cover ?? undefined,
        windSpeed: raw.current.wind_speed_10m ?? 0,
        windDirection: raw.current.wind_direction_10m ?? 0,
        windGust: raw.current.wind_gusts_10m ?? undefined,
        precipitation: raw.current.precipitation ?? undefined,
        condition: conditionFromCode(raw.current.weather_code),
      }
    : undefined;

  const hourly: HourPoint[] = (raw.hourly?.time ?? []).map((time, index) => {
    const source = raw.hourly!;
    return {
      time: fromUnixSeconds(time),
      temperature: at(source.temperature_2m, index) ?? 0,
      feelsLike:
        at(source.apparent_temperature, index) ?? at(source.temperature_2m, index) ?? 0,
      precipitationProbability: at(source.precipitation_probability, index),
      precipitation: at(source.precipitation, index),
      rain: at(source.rain, index),
      showers: at(source.showers, index),
      snowfall: at(source.snowfall, index),
      humidity: at(source.relative_humidity_2m, index),
      dewPoint: at(source.dew_point_2m, index),
      pressure: at(source.pressure_msl, index),
      cloudCover: at(source.cloud_cover, index),
      visibility: at(source.visibility, index),
      windSpeed: at(source.wind_speed_10m, index) ?? 0,
      windGust: at(source.wind_gusts_10m, index),
      windDirection: at(source.wind_direction_10m, index) ?? 0,
      uvIndex: at(source.uv_index, index),
      isDay: (at(source.is_day, index) ?? 1) === 1,
      condition: conditionFromCode(at(source.weather_code, index)),
      cape: at(source.cape, index),
      freezingLevel: at(source.freezing_level_height, index),
    };
  });

  const daily: DayPoint[] = (raw.daily?.time ?? []).map((time, index) => {
    const source = raw.daily!;
    const sunriseAt = source.sunrise[index];
    const sunsetAt = source.sunset[index];
    return {
      // `time` is the epoch of the location's own midnight, so the UTC date it
      // falls on is the previous day east of Greenwich. Key by the local date.
      date: localDateKey(time * 1000, raw.timezone),
      temperatureMax: at(source.temperature_2m_max, index) ?? 0,
      temperatureMin: at(source.temperature_2m_min, index) ?? 0,
      feelsLikeMax: at(source.apparent_temperature_max, index),
      feelsLikeMin: at(source.apparent_temperature_min, index),
      precipitationSum: at(source.precipitation_sum, index),
      rainSum: at(source.rain_sum, index),
      snowfallSum: at(source.snowfall_sum, index),
      precipitationHours: at(source.precipitation_hours, index),
      precipitationProbabilityMax: at(source.precipitation_probability_max, index),
      windSpeedMax: at(source.wind_speed_10m_max, index),
      windGustMax: at(source.wind_gusts_10m_max, index),
      windDirectionDominant: at(source.wind_direction_10m_dominant, index),
      uvIndexMax: at(source.uv_index_max, index),
      sunrise: sunriseAt === undefined ? undefined : fromUnixSeconds(sunriseAt),
      sunset: sunsetAt === undefined ? undefined : fromUnixSeconds(sunsetAt),
      daylightSeconds: at(source.daylight_duration, index),
      sunshineSeconds: at(source.sunshine_duration, index),
      condition: conditionFromCode(at(source.weather_code, index)),
    };
  });

  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      current,
      hourly,
      daily,
      nowcast: buildNowcast(raw.minutely_15, latitude, longitude),
      timezone: raw.timezone,
      elevation: raw.elevation ?? undefined,
    },
  };
}

function buildNowcast(
  source: { time: number[]; precipitation: Array<number | null> } | undefined,
  latitude: number,
  longitude: number,
): PrecipitationNowcast | undefined {
  if (!source || source.time.length === 0) return undefined;

  const now = Date.now();
  const horizonMs = now + 4 * 60 * 60 * 1000;

  const steps: NowcastStep[] = [];
  for (let index = 0; index < source.time.length; index += 1) {
    const ms = source.time[index] * 1000;
    if (ms < now - 15 * 60 * 1000 || ms > horizonMs) continue;

    const precipitation = at(source.precipitation, index) ?? 0;
    // A 15-minute accumulation describes an hourly rate four times its size,
    // and it is the rate that the intensity words are defined against.
    const ratePerHour = precipitation * 4;
    steps.push({
      time: fromUnixSeconds(source.time[index]),
      precipitation,
      ratePerHour,
      intensity: precipitationIntensity(ratePerHour),
    });
  }

  if (steps.length === 0) return undefined;

  const firstWet = steps.find((step) => step.precipitation > 0);
  const endsAt = firstWet
    ? steps.find(
        (step) => step.time > firstWet.time && step.precipitation === 0,
      )?.time
    : undefined;

  return {
    resolutionMinutes: 15,
    steps,
    highResolution: hasNativeNowcast(latitude, longitude),
    startsAt: firstWet?.time,
    endsAt,
    totalMm: steps.reduce((sum, step) => sum + step.precipitation, 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Air quality                                                                */
/* -------------------------------------------------------------------------- */

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
): Promise<GuardResult<AirQuality>> {
  const url = `${AIR_QUALITY_HOST}?${search({
    latitude,
    longitude,
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 3,
    current:
      "us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust",
    hourly:
      "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
  })}`;

  const result = await fetchJson(url, {
    subsystem: "air-quality",
    schema: AirQualityResponse,
    revalidate: 900,
  });

  if (!result.ok) return result;

  const current = result.data.current;
  if (!current) {
    return {
      ok: false,
      reason: "unavailable",
      message: "No air quality readings are published for this location.",
      latencyMs: result.latencyMs,
    };
  }

  // Pollen is a European-only product; take the reading closest to now.
  const hourly = result.data.hourly;
  const pollenIndex = hourly
    ? hourly.time.findIndex((time) => time * 1000 >= Date.now() - 3600_000)
    : -1;

  const pollenAt = (list: Array<number | null> | undefined) =>
    pollenIndex >= 0 ? at(list, pollenIndex) : undefined;

  const pollen =
    pollenIndex >= 0
      ? {
          alder: pollenAt(hourly?.alder_pollen),
          birch: pollenAt(hourly?.birch_pollen),
          grass: pollenAt(hourly?.grass_pollen),
          mugwort: pollenAt(hourly?.mugwort_pollen),
          olive: pollenAt(hourly?.olive_pollen),
          ragweed: pollenAt(hourly?.ragweed_pollen),
        }
      : undefined;

  const hasPollen =
    pollen !== undefined && Object.values(pollen).some((value) => value !== undefined);

  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      observedAt: fromUnixSeconds(current.time),
      usAqi: current.us_aqi ?? undefined,
      europeanAqi: current.european_aqi ?? undefined,
      pm25: current.pm2_5 ?? undefined,
      pm10: current.pm10 ?? undefined,
      ozone: current.ozone ?? undefined,
      nitrogenDioxide: current.nitrogen_dioxide ?? undefined,
      sulphurDioxide: current.sulphur_dioxide ?? undefined,
      carbonMonoxide: current.carbon_monoxide ?? undefined,
      dust: current.dust ?? undefined,
      pollen: hasPollen ? pollen : undefined,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                  */
/* -------------------------------------------------------------------------- */

export async function searchLocations(
  query: string,
  { count = 8, language = "en" }: { count?: number; language?: string } = {},
): Promise<GuardResult<GeoLocation[]>> {
  const url = `${GEOCODING_HOST}?${search({
    name: query,
    count,
    language,
    format: "json",
  })}`;

  const result = await fetchJson(url, {
    subsystem: "geocoding",
    schema: GeocodingResponse,
    revalidate: 86400,
  });

  if (!result.ok) return result;

  const locations: GeoLocation[] = (result.data.results ?? []).map((entry) => ({
    id: `openmeteo:${entry.id}`,
    name: entry.name,
    country: entry.country ?? "",
    countryCode: entry.country_code ?? "",
    admin1: entry.admin1 ?? undefined,
    admin2: entry.admin2 ?? undefined,
    latitude: entry.latitude,
    longitude: entry.longitude,
    elevation: entry.elevation ?? undefined,
    timezone: entry.timezone ?? "UTC",
    population: entry.population ?? undefined,
    slug: slugify(entry.name, entry.country ?? entry.country_code ?? ""),
  }));

  return { ok: true, data: locations, latencyMs: result.latencyMs };
}

/* -------------------------------------------------------------------------- */
/* Batched current conditions                                                 */
/* -------------------------------------------------------------------------- */

const BatchResponse = z.union([
  z.array(ForecastResponse),
  ForecastResponse.transform((single) => [single]),
]);

export interface CurrentSnapshot {
  latitude: number;
  longitude: number;
  temperature: number;
  code: number;
  isDay: boolean;
}

/**
 * Current conditions for several places in a single request.
 *
 * Open-Meteo accepts comma-separated coordinate lists, which is what makes the
 * search previews and the comparison view affordable: six cities cost one
 * upstream call rather than six, and stay well inside the rate limit.
 */
export async function fetchCurrentBatch(
  coordinates: ReadonlyArray<{ latitude: number; longitude: number }>,
): Promise<GuardResult<CurrentSnapshot[]>> {
  if (coordinates.length === 0) {
    return { ok: true, data: [], latencyMs: 0 };
  }

  const url = `${FORECAST_HOST}?${search({
    latitude: coordinates.map((point) => point.latitude.toFixed(4)).join(","),
    longitude: coordinates.map((point) => point.longitude.toFixed(4)).join(","),
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 1,
    current: "temperature_2m,weather_code,is_day",
  })}`;

  const result = await fetchJson(url, {
    subsystem: "forecast",
    schema: BatchResponse,
    timeoutMs: 5000,
    revalidate: 300,
  });

  if (!result.ok) return result;

  const snapshots: CurrentSnapshot[] = result.data.flatMap((entry) =>
    entry.current
      ? [
          {
            latitude: entry.latitude,
            longitude: entry.longitude,
            temperature: entry.current.temperature_2m ?? 0,
            code: entry.current.weather_code ?? 0,
            isDay: (entry.current.is_day ?? 1) === 1,
          },
        ]
      : [],
  );

  return { ok: true, data: snapshots, latencyMs: result.latencyMs };
}

/* -------------------------------------------------------------------------- */
/* Astronomy                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sunrise and sunset come from the forecast where available; the moon is
 * computed, because no free provider publishes lunar rise and set worldwide.
 */
export function buildAstronomy(
  location: GeoLocation,
  daily: DayPoint[],
  days = 7,
): Astronomy[] {
  return daily.slice(0, days).map((day) => {
    // Local noon, resolved through the zone, so the reference instant is inside
    // the right calendar day even at UTC+13 and UTC−11.
    const [year, month, dayOfMonth] = day.date.split("-").map(Number);
    const noon = new Date(
      utcInstantForLocal(year, month, dayOfMonth, 12, 0, location.timezone),
    ).toISOString();

    const sun = day.sunrise && day.sunset
      ? { rise: day.sunrise, set: day.sunset }
      : sunRiseSet(noon, location.latitude, location.longitude, location.timezone);
    const moon = moonRiseSet(noon, location.latitude, location.longitude, location.timezone);
    const phase = moonPhase(noon);

    return {
      date: day.date,
      sunrise: sun.rise,
      sunset: sun.set,
      solarNoon: solarNoon(noon, location.latitude, location.longitude, location.timezone),
      daylightSeconds: day.daylightSeconds,
      moonrise: moon.rise,
      moonset: moon.set,
      moonPhase: phase.phase,
      moonPhaseLabel: phase.label,
      moonIllumination: phase.illumination,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Model agreement                                                            */
/* -------------------------------------------------------------------------- */

const CONFIDENCE_MODELS = [
  "ecmwf_ifs025",
  "gfs_seamless",
  "icon_seamless",
  "gem_seamless",
] as const;

/**
 * Real forecast uncertainty: ask four independent numerical models the same
 * question and measure how far apart their answers are. Wide disagreement on
 * day five is exactly the situation a confidence indicator should surface.
 */
export async function fetchForecastConfidence(
  latitude: number,
  longitude: number,
): Promise<GuardResult<ForecastConfidence>> {
  const url = `${FORECAST_HOST}?${search({
    latitude,
    longitude,
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 7,
    daily: "temperature_2m_max,precipitation_sum",
    models: CONFIDENCE_MODELS.join(","),
  })}`;

  const result = await fetchJson(url, {
    subsystem: "forecast",
    schema: ModelSpreadResponse,
    revalidate: 1800,
  });

  if (!result.ok) return result;

  const daily = result.data.daily as Record<string, unknown> | undefined;
  if (!daily) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Model comparison is not available for this location.",
      latencyMs: result.latencyMs,
    };
  }

  const seriesFor = (field: string): number[][] =>
    CONFIDENCE_MODELS.map((model) => daily[`${field}_${model}`])
      .filter((series): series is Array<number | null> => Array.isArray(series))
      .map((series) => series.map((value) => (value === null ? Number.NaN : value)));

  const spreadOf = (series: number[][]): number => {
    if (series.length < 2) return 0;
    const length = Math.min(...series.map((entry) => entry.length));
    let widest = 0;
    for (let index = 0; index < length; index += 1) {
      const column = series
        .map((entry) => entry[index])
        .filter((value) => Number.isFinite(value));
      if (column.length < 2) continue;
      widest = Math.max(widest, Math.max(...column) - Math.min(...column));
    }
    return Math.round(widest * 10) / 10;
  };

  const temperatureSpread = spreadOf(seriesFor("temperature_2m_max"));
  const precipitationSpread = spreadOf(seriesFor("precipitation_sum"));

  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      models: [...CONFIDENCE_MODELS],
      temperatureSpread,
      precipitationSpread,
      // Thresholds chosen so "low" means the models disagree by more than a
      // jumper's worth of temperature over the coming week.
      level:
        temperatureSpread <= 2.5 ? "high" : temperatureSpread <= 5 ? "moderate" : "low",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchArchive(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
): Promise<GuardResult<HistoricalObservation[]>> {
  const url = `${ARCHIVE_HOST}?${search({
    latitude,
    longitude,
    start_date: startDate,
    end_date: endDate,
    timezone: "auto",
    timeformat: "unixtime",
    daily:
      "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,pressure_msl_mean,relative_humidity_2m_mean",
  })}`;

  const result = await fetchJson(url, {
    subsystem: "archive",
    schema: ArchiveResponse,
    timeoutMs: 12000,
    revalidate: 604800,
  });

  if (!result.ok) return result;

  const source = result.data.daily;
  const zone = result.data.timezone;
  const observations: HistoricalObservation[] = (source?.time ?? []).map((time, index) => ({
    date: localDateKey(time * 1000, zone),
    temperatureMax: at(source!.temperature_2m_max, index),
    temperatureMin: at(source!.temperature_2m_min, index),
    temperatureMean: at(source!.temperature_2m_mean, index),
    precipitationSum: at(source!.precipitation_sum, index),
    windSpeedMax: at(source!.wind_speed_10m_max, index),
    pressureMean: at(source!.pressure_msl_mean, index),
    humidityMean: at(source!.relative_humidity_2m_mean, index),
  }));

  return { ok: true, data: observations, latencyMs: result.latencyMs };
}

/**
 * Climate normals for one month, averaged over the last `years` complete years
 * of reanalysis. This is what "3.4 °C above average" is measured against, and
 * the sample size travels with the number so the UI can qualify it.
 */
export async function fetchClimateNormal(
  latitude: number,
  longitude: number,
  month: number,
  years = 10,
): Promise<GuardResult<ClimateNormal>> {
  const thisYear = new Date().getUTCFullYear();
  // ERA5 lags real time by about five days, so the current year is excluded.
  const lastComplete = thisYear - 1;
  const firstYear = lastComplete - years + 1;

  const startDate = `${firstYear}-${String(month).padStart(2, "0")}-01`;
  const endMonth = new Date(Date.UTC(lastComplete, month, 0)).getUTCDate();
  const endDate = `${lastComplete}-${String(month).padStart(2, "0")}-${endMonth}`;

  const result = await fetchArchive(latitude, longitude, startDate, endDate);
  if (!result.ok) return result;

  const inMonth = result.data.filter(
    (entry) => Number(entry.date.slice(5, 7)) === month,
  );

  const mean = (pick: (entry: HistoricalObservation) => number | undefined): number => {
    const numbers = inMonth
      .map(pick)
      .filter((value): value is number => value !== undefined);
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  };

  const distinctYears = new Set(inMonth.map((entry) => entry.date.slice(0, 4))).size;

  return {
    ok: true,
    latencyMs: result.latencyMs,
    data: {
      month,
      temperatureMeanMax: Math.round(mean((entry) => entry.temperatureMax) * 10) / 10,
      temperatureMeanMin: Math.round(mean((entry) => entry.temperatureMin) * 10) / 10,
      // Monthly total, not daily mean.
      precipitationMean:
        Math.round(
          mean((entry) => entry.precipitationSum) *
            (inMonth.length / Math.max(1, distinctYears)) *
            10,
        ) / 10,
      sampleYears: distinctYears,
    },
  };
}
