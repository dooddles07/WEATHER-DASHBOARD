import type { HourPoint } from "@/types/weather";

/**
 * Reading the forecast at an arbitrary moment.
 *
 * The scrub interaction moves continuously while the data arrives hourly, so
 * every card asks this module for "the weather at time t" rather than picking
 * an index. Continuous quantities are interpolated between the bracketing
 * hours; categorical ones are taken from the nearer hour, because there is no
 * meaningful halfway point between "overcast" and "thunderstorm".
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const maybeLerp = (
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return lerp(a, b, t);
};

/** Angles wrap: interpolating 350° to 10° must cross zero, not sweep backwards. */
function lerpBearing(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + delta * t) % 360) + 360) % 360;
}

/** Index of the last hour at or before `instant`. */
function bracket(hours: HourPoint[], instant: number): number {
  let low = 0;
  let high = hours.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (Date.parse(hours[mid].time) <= instant) low = mid + 1;
    else high = mid - 1;
  }
  return high;
}

/** The hour containing `instant`, without interpolation. */
export function hourAt(hours: HourPoint[], instant: number): HourPoint | undefined {
  if (hours.length === 0) return undefined;
  const index = bracket(hours, instant);
  if (index < 0) return hours[0];
  return hours[Math.min(index, hours.length - 1)];
}

/**
 * The forecast at `instant`, interpolated. Returns `undefined` only when there
 * is no data at all — outside the forecast range it clamps to the nearest end,
 * so scrubbing past the edge holds rather than blanking the dashboard.
 */
export function interpolateHour(
  hours: HourPoint[],
  instant: number,
): HourPoint | undefined {
  if (hours.length === 0) return undefined;
  if (hours.length === 1) return hours[0];

  const index = bracket(hours, instant);
  if (index < 0) return hours[0];
  if (index >= hours.length - 1) return hours[hours.length - 1];

  const before = hours[index];
  const after = hours[index + 1];

  const fromMs = Date.parse(before.time);
  const toMs = Date.parse(after.time);
  const span = toMs - fromMs;
  const t = span === 0 ? 0 : (instant - fromMs) / span;

  // Past the midpoint the later hour is the better description of conditions.
  const nearer = t < 0.5 ? before : after;

  return {
    time: new Date(instant).toISOString(),
    temperature: lerp(before.temperature, after.temperature, t),
    feelsLike: lerp(before.feelsLike, after.feelsLike, t),
    precipitationProbability: maybeLerp(
      before.precipitationProbability,
      after.precipitationProbability,
      t,
    ),
    precipitation: maybeLerp(before.precipitation, after.precipitation, t),
    rain: maybeLerp(before.rain, after.rain, t),
    showers: maybeLerp(before.showers, after.showers, t),
    snowfall: maybeLerp(before.snowfall, after.snowfall, t),
    humidity: maybeLerp(before.humidity, after.humidity, t),
    dewPoint: maybeLerp(before.dewPoint, after.dewPoint, t),
    pressure: maybeLerp(before.pressure, after.pressure, t),
    cloudCover: maybeLerp(before.cloudCover, after.cloudCover, t),
    visibility: maybeLerp(before.visibility, after.visibility, t),
    windSpeed: lerp(before.windSpeed, after.windSpeed, t),
    windGust: maybeLerp(before.windGust, after.windGust, t),
    windDirection: lerpBearing(before.windDirection, after.windDirection, t),
    uvIndex: maybeLerp(before.uvIndex, after.uvIndex, t),
    cape: maybeLerp(before.cape, after.cape, t),
    freezingLevel: maybeLerp(before.freezingLevel, after.freezingLevel, t),
    isDay: nearer.isDay,
    condition: nearer.condition,
  };
}

/** The span the ribbon and the scrub control are bounded by. */
export function forecastRange(
  hours: HourPoint[],
): { from: number; to: number } | undefined {
  if (hours.length === 0) return undefined;
  return {
    from: Date.parse(hours[0].time),
    to: Date.parse(hours[hours.length - 1].time),
  };
}
