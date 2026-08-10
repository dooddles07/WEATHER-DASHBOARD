import { formatHour, isSameLocalDay, relativeMinutes } from "@/lib/time";
import type { GeoLocation } from "@/types/location";
import type {
  AirQuality,
  CurrentWeather,
  DayPoint,
  HourPoint,
  PrecipitationNowcast,
} from "@/types/weather";

import { headlineIndex } from "./aqi";
import { gustWarning } from "./beaufort";
import { bestWindow } from "./scores";
import { isFrozen, isPrecipitating } from "./wmo";

/**
 * Weather intelligence.
 *
 * Every sentence produced here is derived from a value in the forecast. There
 * is no template that fires without data behind it, and nothing is invented to
 * fill space: if the data does not support an observation, no insight is
 * emitted. That constraint is what makes the section worth reading.
 *
 * Insights are ranked by how much they should change someone's plans, which is
 * not the same as how dramatic they sound.
 */

export type InsightKind =
  | "precipitation"
  | "temperature"
  | "wind"
  | "uv"
  | "air-quality"
  | "visibility"
  | "comfort"
  | "planning"
  | "storm";

export interface Insight {
  id: string;
  kind: InsightKind;
  /** Sorted descending. 90+ changes plans, 40 is context. */
  priority: number;
  headline: string;
  detail?: string;
}

export interface InsightInputs {
  location: GeoLocation;
  current?: CurrentWeather;
  hourly: HourPoint[];
  daily: DayPoint[];
  nowcast?: PrecipitationNowcast;
  airQuality?: AirQuality;
  now?: number;
}

const round = (value: number) => Math.round(value);

/** Hours from now to the end of the location's current day. */
function restOfToday(hours: HourPoint[], timezone: string, now: number): HourPoint[] {
  return hours.filter(
    (hour) =>
      Date.parse(hour.time) >= now && isSameLocalDay(hour.time, now, timezone),
  );
}

const upcoming = (hours: HourPoint[], now: number, count: number): HourPoint[] =>
  hours.filter((hour) => Date.parse(hour.time) >= now).slice(0, count);

/* -------------------------------------------------------------------------- */
/* Individual rules                                                           */
/* -------------------------------------------------------------------------- */

/** Precipitation timing, the single most actionable thing a forecast holds. */
function precipitationInsight(
  { nowcast, hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  // A nowcast onset is precise enough to give a countdown.
  if (nowcast?.startsAt) {
    const startsInMinutes = (Date.parse(nowcast.startsAt) - now) / 60000;

    if (startsInMinutes > 0 && startsInMinutes <= 120) {
      const peak = nowcast.steps.reduce(
        (worst, step) => (step.ratePerHour > worst.ratePerHour ? step : worst),
        nowcast.steps[0],
      );
      return {
        id: "precip-onset",
        kind: "precipitation",
        priority: 100,
        headline: `Rain expected ${relativeMinutes(nowcast.startsAt, now)}.`,
        detail: nowcast.endsAt
          ? `Easing around ${formatHour(nowcast.endsAt, location.timezone)}, peaking at ${peak.intensity.replace("-", " ")}.`
          : `Peaking at ${peak.intensity.replace("-", " ")}.`,
      };
    }

    // Already raining: the useful question is when it stops.
    if (startsInMinutes <= 0 && nowcast.endsAt) {
      return {
        id: "precip-easing",
        kind: "precipitation",
        priority: 100,
        headline: `Rain easing ${relativeMinutes(nowcast.endsAt, now)}.`,
        detail: `About ${nowcast.totalMm.toFixed(1)} mm expected in total.`,
      };
    }
  }

  // Otherwise fall back to the hourly probability curve.
  const next = upcoming(hourly, now, 12);
  const firstWet = next.find((hour) => (hour.precipitationProbability ?? 0) >= 50);
  if (!firstWet) {
    const anyRain = next.some((hour) => (hour.precipitationProbability ?? 0) >= 25);
    if (!anyRain && next.length > 0) {
      return {
        id: "precip-dry",
        kind: "precipitation",
        priority: 45,
        headline: "No rain expected in the next 12 hours.",
      };
    }
    return undefined;
  }

  return {
    id: "precip-hourly",
    kind: "precipitation",
    priority: 85,
    headline: `Rain likely from ${formatHour(firstWet.time, location.timezone)}.`,
    detail: `${round(firstWet.precipitationProbability ?? 0)}% chance, ${firstWet.condition.label.toLowerCase()}.`,
  };
}

/** When the day peaks, and by how much. */
function temperatureInsight(
  { hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const remaining = restOfToday(hourly, location.timezone, now);
  if (remaining.length < 3) return undefined;

  const peak = remaining.reduce(
    (warmest, hour) => (hour.temperature > warmest.temperature ? hour : warmest),
    remaining[0],
  );

  // Only worth saying if the peak is still ahead and meaningfully warmer.
  if (Date.parse(peak.time) <= now) return undefined;
  if (peak.temperature - remaining[0].temperature < 1.5) return undefined;

  return {
    id: "temp-peak",
    kind: "temperature",
    priority: 60,
    headline: `Temperatures peak around ${formatHour(peak.time, location.timezone)} at ${round(peak.temperature)}°.`,
    detail:
      Math.abs(peak.feelsLike - peak.temperature) >= 2
        ? `It will feel closer to ${round(peak.feelsLike)}°.`
        : undefined,
  };
}

/** Overnight low, which is what determines whether you need a coat later. */
function overnightInsight(
  { hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const overnight = upcoming(hourly, now, 18).filter((hour) => !hour.isDay);
  if (overnight.length < 3) return undefined;

  const coldest = overnight.reduce(
    (lowest, hour) => (hour.temperature < lowest.temperature ? hour : lowest),
    overnight[0],
  );

  if (coldest.temperature > 4) return undefined;

  return {
    id: "temp-overnight",
    kind: "temperature",
    priority: coldest.temperature <= 0 ? 88 : 65,
    headline:
      coldest.temperature <= 0
        ? `Freezing overnight, down to ${round(coldest.temperature)}°.`
        : `Cold overnight, down to ${round(coldest.temperature)}°.`,
    detail:
      coldest.temperature <= 0
        ? `Frost is likely by ${formatHour(coldest.time, location.timezone)}.`
        : undefined,
  };
}

function windInsight(
  { hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const next = upcoming(hourly, now, 12);
  if (next.length === 0) return undefined;

  const windiest = next.reduce(
    (strongest, hour) =>
      (hour.windGust ?? hour.windSpeed) > (strongest.windGust ?? strongest.windSpeed)
        ? hour
        : strongest,
    next[0],
  );

  const warning = gustWarning(windiest.windSpeed, windiest.windGust);
  if (warning.level === "none") return undefined;

  return {
    id: "wind-gusts",
    kind: "wind",
    priority: warning.level === "hazardous" ? 92 : 58,
    headline: `Gusts to ${round(windiest.windGust ?? windiest.windSpeed)} km/h around ${formatHour(windiest.time, location.timezone)}.`,
    detail: warning.message,
  };
}

function uvInsight({ hourly, location }: InsightInputs, now: number): Insight | undefined {
  const today = restOfToday(hourly, location.timezone, now).filter(
    (hour) => (hour.uvIndex ?? 0) > 0,
  );
  if (today.length === 0) return undefined;

  const peak = today.reduce(
    (highest, hour) => ((hour.uvIndex ?? 0) > (highest.uvIndex ?? 0) ? hour : highest),
    today[0],
  );

  if ((peak.uvIndex ?? 0) < 6) return undefined;

  // Report the window at or above "high", which is what protection advice keys off.
  const window = today.filter((hour) => (hour.uvIndex ?? 0) >= 6);
  const from = window[0];
  const to = window[window.length - 1];

  return {
    id: "uv-peak",
    kind: "uv",
    priority: (peak.uvIndex ?? 0) >= 11 ? 90 : 70,
    headline: `UV reaches ${round(peak.uvIndex ?? 0)} today.`,
    detail: `High exposure between ${formatHour(from.time, location.timezone)} and ${formatHour(to.time, location.timezone)}. Sunscreen and shade are worth planning for.`,
  };
}

function airQualityInsight({ airQuality }: InsightInputs): Insight | undefined {
  const index = airQuality ? headlineIndex(airQuality) : undefined;
  if (index === undefined || index <= 100) return undefined;

  return {
    id: "aqi",
    kind: "air-quality",
    priority: index > 150 ? 86 : 62,
    headline: `Air quality index ${round(index)}.`,
    detail:
      index > 150
        ? "Consider reducing prolonged activity outdoors."
        : "Sensitive groups may want to shorten intense outdoor activity.",
  };
}

function visibilityInsight(
  { hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const next = upcoming(hourly, now, 8);
  const foggy = next.find((hour) => (hour.visibility ?? 20000) < 1000);
  if (!foggy) return undefined;

  return {
    id: "visibility",
    kind: "visibility",
    priority: 80,
    headline: `Fog expected around ${formatHour(foggy.time, location.timezone)}.`,
    detail: `Visibility down to about ${round((foggy.visibility ?? 0) / 100) * 100} m. Allow extra time on the road.`,
  };
}

/** Convective potential is the honest basis for a storm mention. */
function stormInsight(
  { hourly, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const next = upcoming(hourly, now, 12);
  const stormy = next.find(
    (hour) =>
      hour.condition.kind === "thunderstorm" ||
      hour.condition.kind === "thunderstorm-hail",
  );
  if (!stormy) return undefined;

  const cape = stormy.cape ?? 0;
  return {
    id: "storm",
    kind: "storm",
    priority: 95,
    headline: `Thunderstorms possible from ${formatHour(stormy.time, location.timezone)}.`,
    detail:
      cape > 2500
        ? "Instability is high — storms could be intense."
        : cape > 1000
          ? "Moderate instability in the atmosphere."
          : undefined,
  };
}

/** The gap between air temperature and how it will actually feel. */
function comfortInsight({ current }: InsightInputs): Insight | undefined {
  if (!current) return undefined;

  const gap = current.feelsLike - current.temperature;
  if (Math.abs(gap) < 3) return undefined;

  return {
    id: "comfort",
    kind: "comfort",
    priority: 50,
    headline:
      gap > 0
        ? `Feels ${round(gap)}° warmer than the air temperature.`
        : `Feels ${round(Math.abs(gap))}° colder than the air temperature.`,
    detail:
      gap > 0
        ? `Humidity at ${round(current.humidity ?? 0)}% is slowing evaporation.`
        : `Wind at ${round(current.windSpeed)} km/h is stripping heat away.`,
  };
}

/** The planning question: when is the best stretch to be outside. */
function planningInsight(
  { hourly, airQuality, location }: InsightInputs,
  now: number,
): Insight | undefined {
  const daylight = upcoming(hourly, now, 14).filter((hour) => hour.isDay);
  if (daylight.length < 4) return undefined;

  const window = bestWindow("outdoor", daylight, airQuality, 3);
  if (!window || window.score < 55) return undefined;

  return {
    id: "planning",
    kind: "planning",
    priority: 55,
    headline: `Best window outdoors: ${formatHour(window.start, location.timezone)} to ${formatHour(window.end, location.timezone)}.`,
    detail: `Conditions score ${window.score} out of 100 across that stretch.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

const RULES: ReadonlyArray<(inputs: InsightInputs, now: number) => Insight | undefined> = [
  precipitationInsight,
  stormInsight,
  windInsight,
  uvInsight,
  airQualityInsight,
  visibilityInsight,
  overnightInsight,
  temperatureInsight,
  comfortInsight,
  planningInsight,
];

export function generateInsights(inputs: InsightInputs, limit = 5): Insight[] {
  const now = inputs.now ?? Date.now();

  return RULES.map((rule) => rule(inputs, now))
    .filter((insight): insight is Insight => insight !== undefined)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Day parts                                                                  */
/* -------------------------------------------------------------------------- */

export interface DayPartSummary {
  part: "Morning" | "Afternoon" | "Evening" | "Overnight";
  temperature: number;
  condition: string;
  precipitationProbability: number;
  summary: string;
}

const PART_WINDOWS: ReadonlyArray<{
  part: DayPartSummary["part"];
  fromHour: number;
  toHour: number;
}> = [
  { part: "Morning", fromHour: 6, toHour: 12 },
  { part: "Afternoon", fromHour: 12, toHour: 18 },
  { part: "Evening", fromHour: 18, toHour: 22 },
  { part: "Overnight", fromHour: 22, toHour: 30 },
];

/**
 * The narrative breakdown of the day. Reads the same hourly data as everything
 * else, bucketed into the parts people actually plan around.
 */
export function summariseDayParts(
  hourly: HourPoint[],
  timezone: string,
  now: number = Date.now(),
): DayPartSummary[] {
  const upcomingHours = hourly.filter((hour) => Date.parse(hour.time) >= now - 3600_000);

  return PART_WINDOWS.flatMap(({ part, fromHour, toHour }) => {
    const inPart = upcomingHours.filter((hour) => {
      const local = Number(formatHour(hour.time, timezone).slice(0, 2));
      const shifted = local < 6 ? local + 24 : local;
      return shifted >= fromHour && shifted < toHour;
    }).slice(0, 8);

    if (inPart.length === 0) return [];

    const meanTemperature =
      inPart.reduce((total, hour) => total + hour.temperature, 0) / inPart.length;
    const maxProbability = Math.max(
      ...inPart.map((hour) => hour.precipitationProbability ?? 0),
    );

    // The most representative condition is the one that persists longest, with
    // any precipitating condition winning ties — that is what people notice.
    const counts = new Map<string, { count: number; label: string; wet: boolean }>();
    for (const hour of inPart) {
      const entry = counts.get(hour.condition.label) ?? {
        count: 0,
        label: hour.condition.label,
        wet: isPrecipitating(hour.condition.kind),
      };
      entry.count += 1;
      counts.set(hour.condition.label, entry);
    }
    const dominant = [...counts.values()].sort(
      (a, b) => Number(b.wet) - Number(a.wet) || b.count - a.count,
    )[0];

    const frozen = inPart.some((hour) => isFrozen(hour.condition.kind));

    const summary = frozen
      ? `${dominant.label}, around ${round(meanTemperature)}°. Frozen precipitation possible.`
      : maxProbability >= 50
        ? `${dominant.label}, around ${round(meanTemperature)}°, with a ${round(maxProbability)}% chance of rain.`
        : `${dominant.label}, around ${round(meanTemperature)}°.`;

    return [
      {
        part,
        temperature: Math.round(meanTemperature * 10) / 10,
        condition: dominant.label,
        precipitationProbability: Math.round(maxProbability),
        summary,
      },
    ];
  });
}
