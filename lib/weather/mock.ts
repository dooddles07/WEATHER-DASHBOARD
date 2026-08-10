import { localDateKey } from "@/lib/time";
import type { AirQuality, DayPoint, HourPoint, PrecipitationNowcast } from "@/types/weather";

import type { ForecastPayload } from "./openmeteo";
import { precipitationIntensity } from "./scales";
import { conditionFromCode } from "./wmo";

/**
 * Development fixtures.
 *
 * Only reachable when `WEATHER_PROVIDER=mock`, which is documented as a
 * development and test setting. Production always talks to a real provider —
 * fabricated weather shown as if it were real is the one thing this product
 * must never do.
 *
 * The generator is deterministic and physically coherent rather than random:
 * a diurnal temperature cycle, humidity that moves inversely with it, and
 * precipitation that arrives in blocks. That makes fixtures useful for
 * exercising charts, the scrub interaction and the degraded states, and it
 * makes screenshots reproducible.
 */

export type MockScenario = "sunny" | "rain" | "storm" | "heat" | "snow" | "fog";

interface CityFixture {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  /** Daily mean temperature, °C. */
  baseTemperature: number;
  /** Half the daily swing, °C. */
  amplitude: number;
  humidity: number;
  windSpeed: number;
  scenario: MockScenario;
  aqi: number;
}

export const CITY_FIXTURES: readonly CityFixture[] = [
  {
    name: "Manila",
    latitude: 14.5995,
    longitude: 120.9842,
    timezone: "Asia/Manila",
    baseTemperature: 29,
    amplitude: 3.5,
    humidity: 78,
    windSpeed: 14,
    scenario: "storm",
    aqi: 68,
  },
  {
    name: "Tokyo",
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: "Asia/Tokyo",
    baseTemperature: 24,
    amplitude: 5,
    humidity: 65,
    windSpeed: 11,
    scenario: "rain",
    aqi: 42,
  },
  {
    name: "New York",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York",
    baseTemperature: 18,
    amplitude: 7,
    humidity: 55,
    windSpeed: 18,
    scenario: "sunny",
    aqi: 35,
  },
  {
    name: "London",
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: "Europe/London",
    baseTemperature: 13,
    amplitude: 5.5,
    humidity: 72,
    windSpeed: 16,
    scenario: "fog",
    aqi: 28,
  },
  {
    name: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: "Asia/Singapore",
    baseTemperature: 28,
    amplitude: 3,
    humidity: 84,
    windSpeed: 9,
    scenario: "rain",
    aqi: 55,
  },
  {
    name: "Sydney",
    latitude: -33.8688,
    longitude: 151.2093,
    timezone: "Australia/Sydney",
    baseTemperature: 21,
    amplitude: 6,
    humidity: 60,
    windSpeed: 20,
    scenario: "sunny",
    aqi: 22,
  },
  {
    name: "Dubai",
    latitude: 25.2048,
    longitude: 55.2708,
    timezone: "Asia/Dubai",
    baseTemperature: 39,
    amplitude: 7,
    humidity: 40,
    windSpeed: 15,
    scenario: "heat",
    aqi: 132,
  },
];

const FALLBACK: CityFixture = {
  name: "Reference",
  latitude: 0,
  longitude: 0,
  timezone: "UTC",
  baseTemperature: 20,
  amplitude: 6,
  humidity: 60,
  windSpeed: 12,
  scenario: "sunny",
  aqi: 40,
};

/** Great-circle distance, so a coordinate resolves to its nearest fixture. */
function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function fixtureFor(latitude: number, longitude: number): CityFixture {
  const scenario = process.env.MOCK_SCENARIO as MockScenario | undefined;

  const nearest = CITY_FIXTURES.reduce(
    (closest, city) => {
      const distance = distanceKm(latitude, longitude, city.latitude, city.longitude);
      return distance < closest.distance ? { city, distance } : closest;
    },
    { city: FALLBACK, distance: Number.POSITIVE_INFINITY },
  );

  const base = nearest.distance < 400 ? nearest.city : { ...FALLBACK, latitude, longitude };
  return scenario ? { ...base, scenario } : base;
}

/* -------------------------------------------------------------------------- */
/* Scenario shapes                                                            */
/* -------------------------------------------------------------------------- */

interface ScenarioShape {
  /** WMO code for a dry hour under this scenario. */
  dryCode: number;
  wetCode: number;
  /** Probability envelope, indexed by hour of day. */
  wetHours: (hourOfDay: number, dayOffset: number) => number;
  /** Millimetres in a fully wet hour. */
  intensity: number;
  temperatureShift: number;
  cloudCover: number;
  visibility: number;
}

const SCENARIOS: Record<MockScenario, ScenarioShape> = {
  sunny: {
    dryCode: 0,
    wetCode: 61,
    wetHours: () => 0.05,
    intensity: 0.4,
    temperatureShift: 1,
    cloudCover: 12,
    visibility: 24000,
  },
  rain: {
    dryCode: 3,
    wetCode: 63,
    // Afternoon-weighted, as convective rain usually is.
    wetHours: (hour) => (hour >= 13 && hour <= 20 ? 0.75 : 0.25),
    intensity: 2.4,
    temperatureShift: -1.5,
    cloudCover: 82,
    visibility: 9000,
  },
  storm: {
    dryCode: 3,
    wetCode: 95,
    wetHours: (hour, day) => (day % 2 === 0 && hour >= 15 && hour <= 21 ? 0.9 : 0.3),
    intensity: 7.5,
    temperatureShift: -2,
    cloudCover: 90,
    visibility: 5000,
  },
  heat: {
    dryCode: 0,
    wetCode: 80,
    wetHours: () => 0.02,
    intensity: 0.2,
    temperatureShift: 4,
    cloudCover: 6,
    visibility: 18000,
  },
  snow: {
    dryCode: 3,
    wetCode: 73,
    wetHours: (hour) => (hour >= 2 && hour <= 14 ? 0.7 : 0.35),
    intensity: 1.8,
    temperatureShift: -14,
    cloudCover: 88,
    visibility: 3000,
  },
  fog: {
    dryCode: 45,
    wetCode: 51,
    wetHours: (hour) => (hour >= 4 && hour <= 10 ? 0.5 : 0.15),
    intensity: 0.3,
    temperatureShift: -1,
    cloudCover: 95,
    visibility: 700,
  },
};

/**
 * Deterministic pseudo-randomness. The same coordinates and hour always
 * produce the same value, so fixtures are stable across renders and reruns.
 */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export function forecastFor(
  latitude: number,
  longitude: number,
  days: number,
): ForecastPayload {
  const city = fixtureFor(latitude, longitude);
  const shape = SCENARIOS[city.scenario];

  // Anchor to the top of the current hour so the series lines up with "now".
  const anchor = new Date();
  anchor.setUTCMinutes(0, 0, 0);
  const startMs = anchor.getTime() - 24 * 3600_000;

  const hourly: HourPoint[] = [];
  const totalHours = (days + 1) * 24;

  for (let index = 0; index < totalHours; index += 1) {
    const ms = startMs + index * 3600_000;
    const iso = new Date(ms).toISOString();
    const hourOfDay = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: city.timezone,
      }).format(ms),
    );
    const dayOffset = Math.floor(index / 24);

    // Diurnal cycle peaking mid-afternoon.
    const diurnal = -Math.cos(((hourOfDay - 3) / 24) * 2 * Math.PI);
    const drift = Math.sin(dayOffset / 3) * 2;
    const jitter = (noise(index + latitude) - 0.5) * 1.2;

    const temperature =
      city.baseTemperature + shape.temperatureShift + diurnal * city.amplitude + drift + jitter;

    const wetChance = shape.wetHours(hourOfDay, dayOffset);
    const wet = noise(index * 3.7 + longitude) < wetChance;
    const precipitation = wet ? shape.intensity * (0.4 + noise(index * 5.1)) : 0;
    const probability = Math.round(
      Math.min(100, wetChance * 100 * (wet ? 1.15 : 0.7) + noise(index) * 10),
    );

    const isDay = hourOfDay >= 6 && hourOfDay < 19;
    const humidity = Math.round(
      Math.min(99, city.humidity - diurnal * 8 + (wet ? 12 : 0)),
    );

    // UV follows the sun, not the clock.
    const solarFactor = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI));
    const uvIndex =
      Math.round(solarFactor * (city.scenario === "heat" ? 11 : 8) * (wet ? 0.4 : 1) * 10) / 10;

    const code = wet ? shape.wetCode : shape.dryCode;
    const windSpeed =
      city.windSpeed + diurnal * 4 + (wet ? 8 : 0) + noise(index * 2.3) * 5;

    hourly.push({
      time: iso,
      temperature: Math.round(temperature * 10) / 10,
      feelsLike:
        Math.round(
          (temperature +
            (humidity > 70 && temperature > 26 ? 4 : 0) -
            (windSpeed > 25 && temperature < 12 ? 3 : 0)) *
            10,
        ) / 10,
      precipitationProbability: probability,
      precipitation: Math.round(precipitation * 100) / 100,
      rain: city.scenario === "snow" ? 0 : Math.round(precipitation * 100) / 100,
      snowfall: city.scenario === "snow" ? Math.round(precipitation * 70) / 100 : 0,
      humidity,
      dewPoint: Math.round((temperature - (100 - humidity) / 5) * 10) / 10,
      pressure: Math.round(1013 + Math.sin(dayOffset / 2) * 6 - (wet ? 5 : 0)),
      cloudCover: Math.round(Math.min(100, shape.cloudCover + (wet ? 10 : 0))),
      visibility: wet ? Math.round(shape.visibility * 0.6) : shape.visibility,
      windSpeed: Math.round(windSpeed),
      windGust: Math.round(windSpeed * (1.4 + noise(index * 7.9) * 0.5)),
      windDirection: Math.round((200 + Math.sin(index / 8) * 60 + noise(index) * 20) % 360),
      uvIndex,
      isDay,
      condition: conditionFromCode(code),
      cape: city.scenario === "storm" ? 1800 + noise(index) * 1500 : 300,
      freezingLevel: city.scenario === "snow" ? 400 : 4200,
    });
  }

  return {
    current: {
      ...hourly[24],
      observedAt: hourly[24].time,
      windSpeed: hourly[24].windSpeed,
      windDirection: hourly[24].windDirection,
    },
    hourly,
    daily: aggregateDaily(hourly, city.timezone),
    nowcast: buildMockNowcast(hourly, shape),
    timezone: city.timezone,
    elevation: 12,
  };
}

function aggregateDaily(hourly: HourPoint[], timezone: string): DayPoint[] {
  const byDate = new Map<string, HourPoint[]>();

  for (const hour of hourly) {
    const key = localDateKey(hour.time, timezone);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(hour);
    else byDate.set(key, [hour]);
  }

  return [...byDate.entries()].map(([date, hours]) => {
    const temperatures = hours.map((hour) => hour.temperature);
    const wettest = hours.reduce(
      (worst, hour) => ((hour.precipitation ?? 0) > (worst.precipitation ?? 0) ? hour : worst),
      hours[0],
    );

    return {
      date,
      temperatureMax: Math.max(...temperatures),
      temperatureMin: Math.min(...temperatures),
      feelsLikeMax: Math.max(...hours.map((hour) => hour.feelsLike)),
      feelsLikeMin: Math.min(...hours.map((hour) => hour.feelsLike)),
      precipitationSum:
        Math.round(hours.reduce((total, hour) => total + (hour.precipitation ?? 0), 0) * 10) / 10,
      precipitationHours: hours.filter((hour) => (hour.precipitation ?? 0) > 0).length,
      precipitationProbabilityMax: Math.max(
        ...hours.map((hour) => hour.precipitationProbability ?? 0),
      ),
      windSpeedMax: Math.max(...hours.map((hour) => hour.windSpeed)),
      windGustMax: Math.max(...hours.map((hour) => hour.windGust ?? hour.windSpeed)),
      windDirectionDominant: hours[12]?.windDirection ?? hours[0].windDirection,
      uvIndexMax: Math.max(...hours.map((hour) => hour.uvIndex ?? 0)),
      daylightSeconds: 12.5 * 3600,
      condition: wettest.condition,
    };
  });
}

function buildMockNowcast(
  hourly: HourPoint[],
  shape: ScenarioShape,
): PrecipitationNowcast {
  const now = Date.now();
  const steps = [];

  for (let index = 0; index < 16; index += 1) {
    const ms = now + index * 15 * 60000;
    const hour = hourly.find(
      (entry) => Math.abs(Date.parse(entry.time) - ms) <= 30 * 60000,
    );
    const hourlyRate = hour?.precipitation ?? 0;
    // Taper within the hour so the timeline has shape rather than plateaus.
    const ratePerHour = hourlyRate * (0.6 + 0.5 * Math.sin((index / 16) * Math.PI));
    const precipitation = ratePerHour / 4;

    steps.push({
      time: new Date(ms).toISOString(),
      precipitation: Math.round(precipitation * 100) / 100,
      ratePerHour: Math.round(ratePerHour * 100) / 100,
      intensity: precipitationIntensity(ratePerHour),
    });
  }

  const firstWet = steps.find((step) => step.precipitation > 0);
  const endsAt = firstWet
    ? steps.find((step) => step.time > firstWet.time && step.precipitation === 0)?.time
    : undefined;

  return {
    resolutionMinutes: 15,
    steps,
    highResolution: shape.intensity > 1,
    startsAt: firstWet?.time,
    endsAt,
    totalMm: Math.round(steps.reduce((total, step) => total + step.precipitation, 0) * 100) / 100,
  };
}

export function airQualityFor(latitude: number, longitude: number): AirQuality {
  const city = fixtureFor(latitude, longitude);
  const index = city.aqi;

  return {
    observedAt: new Date().toISOString(),
    usAqi: index,
    europeanAqi: Math.round(index * 0.6),
    // Concentrations chosen to reproduce the fixture's headline index.
    pm25: Math.round((index <= 50 ? index * 0.18 : 9 + (index - 50) * 0.53) * 10) / 10,
    pm10: Math.round(index * 0.9 * 10) / 10,
    ozone: Math.round(60 + index * 0.4),
    nitrogenDioxide: Math.round(12 + index * 0.25),
    sulphurDioxide: Math.round(3 + index * 0.05),
    carbonMonoxide: Math.round(180 + index * 2),
    dust: city.scenario === "heat" ? 120 : 8,
  };
}
