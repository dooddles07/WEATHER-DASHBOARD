import { formatHour } from "@/lib/time";
import { headlineIndex } from "@/lib/weather/aqi";
import type { SeverityLevel } from "@/lib/weather/scales";
import { isFrozen } from "@/lib/weather/wmo";
import type { AlertCategory, WeatherAlert } from "@/types/alerts";
import type { GeoLocation } from "@/types/location";
import type { AirQuality, HourPoint } from "@/types/weather";

/**
 * Derived advisories.
 *
 * Official warnings exist for the United States and Europe and effectively
 * nowhere else that publishes an open feed. Rather than show most of the world
 * an empty alert centre, this computes advisories from the same forecast the
 * rest of the app is reading, against thresholds documented below.
 *
 * These are never dressed up as official. Every one carries `origin: "derived"`,
 * the rule that produced it, and a source of ISOBAR — and the UI renders them
 * visually distinct from agency bulletins.
 */

interface Rule {
  id: string;
  category: AlertCategory;
  evaluate(input: RuleInput): RuleHit | undefined;
}

export interface RuleInput {
  location: GeoLocation;
  /** The next 24 hours, already filtered to the future. */
  hours: HourPoint[];
  airQuality?: AirQuality;
  now: number;
}

interface RuleHit {
  severity: SeverityLevel;
  headline: string;
  description: string;
  instruction: string;
  /** The threshold and reading that fired, shown in the UI. */
  basis: string;
  effective: string;
  expires?: string;
}

const round = (value: number) => Math.round(value);

/** Highest value in a window, with the hour it occurs. */
function peak(
  hours: HourPoint[],
  pick: (hour: HourPoint) => number | undefined,
): { hour: HourPoint; value: number } | undefined {
  let best: { hour: HourPoint; value: number } | undefined;
  for (const hour of hours) {
    const value = pick(hour);
    if (value === undefined) continue;
    if (!best || value > best.value) best = { hour, value };
  }
  return best;
}

function trough(
  hours: HourPoint[],
  pick: (hour: HourPoint) => number | undefined,
): { hour: HourPoint; value: number } | undefined {
  let best: { hour: HourPoint; value: number } | undefined;
  for (const hour of hours) {
    const value = pick(hour);
    if (value === undefined) continue;
    if (!best || value < best.value) best = { hour, value };
  }
  return best;
}

/** Rolling window sum, for accumulation thresholds. */
function maxRolling(
  hours: HourPoint[],
  windowHours: number,
  pick: (hour: HourPoint) => number | undefined,
): { start: HourPoint; total: number } | undefined {
  if (hours.length < windowHours) return undefined;
  let best: { start: HourPoint; total: number } | undefined;

  for (let index = 0; index + windowHours <= hours.length; index += 1) {
    const total = hours
      .slice(index, index + windowHours)
      .reduce((sum, hour) => sum + (pick(hour) ?? 0), 0);
    if (!best || total > best.total) best = { start: hours[index], total };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                 */
/* -------------------------------------------------------------------------- */

const RULES: readonly Rule[] = [
  {
    id: "heat",
    category: "heat",
    // Apparent temperature, matching the way heat warnings are normally framed.
    evaluate({ hours, location }) {
      const hottest = peak(hours, (hour) => hour.feelsLike);
      if (!hottest || hottest.value < 35) return undefined;

      const severity: SeverityLevel =
        hottest.value >= 54 ? "emergency" : hottest.value >= 41 ? "warning" : "advisory";

      return {
        severity,
        headline: `Extreme heat — feels like ${round(hottest.value)}°`,
        description: `Apparent temperature is forecast to reach ${round(hottest.value)}° around ${formatHour(hottest.hour.time, location.timezone)}, with humidity slowing the body's ability to cool.`,
        instruction:
          "Stay out of direct sun during the hottest hours, drink water regularly, and check on anyone who may struggle in the heat.",
        basis: `Apparent temperature ≥ 35° (advisory), 41° (warning), 54° (emergency). Peak forecast: ${round(hottest.value)}°.`,
        effective: hours[0].time,
        expires: hottest.hour.time,
      };
    },
  },
  {
    id: "cold",
    category: "cold",
    evaluate({ hours, location }) {
      const coldest = trough(hours, (hour) => hour.feelsLike);
      if (!coldest || coldest.value > -15) return undefined;

      return {
        severity: coldest.value <= -25 ? "warning" : "advisory",
        headline: `Extreme cold — feels like ${round(coldest.value)}°`,
        description: `Wind chill is forecast to reach ${round(coldest.value)}° around ${formatHour(coldest.hour.time, location.timezone)}. Exposed skin is at risk in these conditions.`,
        instruction:
          "Cover exposed skin, limit time outdoors, and allow extra time for travel.",
        basis: `Apparent temperature ≤ −15° (advisory), −25° (warning). Lowest forecast: ${round(coldest.value)}°.`,
        effective: hours[0].time,
        expires: coldest.hour.time,
      };
    },
  },
  {
    id: "wind",
    category: "wind",
    evaluate({ hours, location }) {
      const gustiest = peak(hours, (hour) => hour.windGust ?? hour.windSpeed);
      if (!gustiest || gustiest.value < 65) return undefined;

      const severity: SeverityLevel =
        gustiest.value >= 120 ? "emergency" : gustiest.value >= 90 ? "warning" : "advisory";

      return {
        severity,
        headline: `Strong winds — gusts to ${round(gustiest.value)} km/h`,
        description: `Gusts are forecast to reach ${round(gustiest.value)} km/h around ${formatHour(gustiest.hour.time, location.timezone)}. Loose objects, high-sided vehicles and tree limbs are the usual hazards at this strength.`,
        instruction:
          "Secure anything loose outdoors, take care on exposed roads and bridges, and avoid parking under trees.",
        basis: `Gusts ≥ 65 km/h (advisory), 90 (warning), 120 (emergency). Peak forecast: ${round(gustiest.value)} km/h.`,
        effective: hours[0].time,
        expires: gustiest.hour.time,
      };
    },
  },
  {
    id: "rain",
    category: "rain",
    evaluate({ hours, location }) {
      const window = maxRolling(hours, 6, (hour) => hour.rain ?? hour.precipitation);
      if (!window || window.total < 25) return undefined;

      const severity: SeverityLevel =
        window.total >= 100 ? "emergency" : window.total >= 50 ? "warning" : "advisory";

      return {
        severity,
        headline: `Heavy rain — ${round(window.total)} mm in six hours`,
        description: `About ${round(window.total)} mm of rain is forecast in the six hours from ${formatHour(window.start.time, location.timezone)}. Surface water and drainage backup are likely at this rate.`,
        instruction:
          "Avoid driving through standing water, allow extra journey time, and move valuables above floor level in flood-prone buildings.",
        basis: `Six-hour rainfall ≥ 25 mm (advisory), 50 (warning), 100 (emergency). Peak window: ${round(window.total)} mm.`,
        effective: window.start.time,
      };
    },
  },
  {
    id: "snow",
    category: "snow-ice",
    evaluate({ hours, location }) {
      const window = maxRolling(hours, 12, (hour) => hour.snowfall);
      if (!window || window.total < 5) return undefined;

      return {
        severity: window.total >= 15 ? "warning" : "advisory",
        headline: `Snow — ${round(window.total)} cm expected`,
        description: `Around ${round(window.total)} cm of snow is forecast over twelve hours from ${formatHour(window.start.time, location.timezone)}.`,
        instruction:
          "Expect disruption to travel. Clear paths where you can and keep warm clothing with you if driving.",
        basis: `Twelve-hour snowfall ≥ 5 cm (advisory), 15 cm (warning). Forecast: ${round(window.total)} cm.`,
        effective: window.start.time,
      };
    },
  },
  {
    id: "ice",
    category: "snow-ice",
    evaluate({ hours, location }) {
      const icy = hours.find(
        (hour) =>
          (hour.condition.kind === "freezing-rain" ||
            hour.condition.kind === "freezing-drizzle") &&
          (hour.precipitation ?? 0) > 0,
      );
      if (!icy) return undefined;

      return {
        severity: "warning",
        headline: "Freezing rain — ice likely on surfaces",
        description: `Freezing rain is forecast from around ${formatHour(icy.time, location.timezone)}. Rain freezing on contact produces ice on roads, paths and power lines.`,
        instruction:
          "Avoid travel if you can. Ice from freezing rain is far more slippery than snow and gives little visual warning.",
        basis: "Any forecast hour with freezing rain or freezing drizzle and measurable precipitation.",
        effective: icy.time,
      };
    },
  },
  {
    id: "thunderstorm",
    category: "thunderstorm",
    evaluate({ hours, location }) {
      const storm = hours.find(
        (hour) =>
          hour.condition.kind === "thunderstorm" ||
          hour.condition.kind === "thunderstorm-hail",
      );
      if (!storm) return undefined;

      const hail = storm.condition.kind === "thunderstorm-hail";
      const cape = storm.cape ?? 0;

      return {
        severity: hail || cape > 2500 ? "warning" : "watch",
        headline: hail ? "Thunderstorms with hail" : "Thunderstorms possible",
        description: `Thunderstorms are forecast from around ${formatHour(storm.time, location.timezone)}${cape > 0 ? `, with convective available potential energy near ${round(cape)} J/kg` : ""}.${hail ? " Hail is possible." : ""}`,
        instruction:
          "Move indoors when you hear thunder and stay away from open ground and tall isolated trees.",
        basis: `Forecast thunderstorm conditions. Escalates to warning with hail or CAPE above 2500 J/kg. Observed: ${round(cape)} J/kg.`,
        effective: storm.time,
      };
    },
  },
  {
    id: "fog",
    category: "fog",
    evaluate({ hours, location }) {
      const foggy = hours.find((hour) => (hour.visibility ?? 20000) < 500);
      if (!foggy) return undefined;

      return {
        severity: "advisory",
        headline: `Dense fog — visibility under ${round(foggy.visibility ?? 0)} m`,
        description: `Visibility is forecast to fall to about ${round(foggy.visibility ?? 0)} m around ${formatHour(foggy.time, location.timezone)}.`,
        instruction: "Slow down, use dipped headlights, and leave a larger gap when driving.",
        basis: `Visibility below 500 m in any forecast hour. Lowest: ${round(foggy.visibility ?? 0)} m.`,
        effective: foggy.time,
      };
    },
  },
  {
    id: "uv",
    category: "uv",
    evaluate({ hours, location }) {
      const highest = peak(hours, (hour) => hour.uvIndex);
      if (!highest || highest.value < 11) return undefined;

      return {
        severity: "advisory",
        headline: `Extreme UV — index ${round(highest.value)}`,
        description: `The UV index is forecast to reach ${round(highest.value)} around ${formatHour(highest.hour.time, location.timezone)}. Unprotected skin can burn quickly at this level.`,
        instruction:
          "Seek shade in the middle of the day, cover up, and apply sunscreen if you will be outside.",
        basis: `UV index ≥ 11 (the World Health Organization's Extreme band). Peak forecast: ${round(highest.value)}.`,
        effective: hours[0].time,
        expires: highest.hour.time,
      };
    },
  },
  {
    id: "air-quality",
    category: "air-quality",
    evaluate({ airQuality, hours }) {
      const index = airQuality ? headlineIndex(airQuality) : undefined;
      if (index === undefined || index < 150) return undefined;

      return {
        severity: index >= 200 ? "warning" : "advisory",
        headline: `Poor air quality — index ${round(index)}`,
        description: `The air quality index is currently ${round(index)}, in the ${index >= 200 ? "Very unhealthy" : "Unhealthy"} band.`,
        instruction:
          "Reduce prolonged or intense activity outdoors and keep windows closed where practical.",
        basis: `Air quality index ≥ 150 (advisory), 200 (warning). Current: ${round(index)}.`,
        effective: hours[0]?.time ?? new Date().toISOString(),
      };
    },
  },
];

/* -------------------------------------------------------------------------- */

export function deriveAlerts(input: RuleInput): WeatherAlert[] {
  if (input.hours.length === 0) return [];

  return RULES.flatMap((rule) => {
    const hit = rule.evaluate(input);
    if (!hit) return [];

    return [
      {
        id: `derived:${rule.id}:${input.location.id}`,
        origin: "derived" as const,
        source: "ISOBAR (derived from forecast data)",
        severity: hit.severity,
        category: rule.category,
        headline: hit.headline,
        description: hit.description,
        instruction: hit.instruction,
        areas: [input.location.name],
        effective: hit.effective,
        expires: hit.expires,
        basis: hit.basis,
      },
    ];
  });
}

/**
 * Frozen precipitation in the forecast is worth surfacing on the dashboard even
 * when it stays below advisory thresholds, because it changes what people wear
 * and how they travel.
 */
export const hasFrozenPrecipitation = (hours: HourPoint[]): boolean =>
  hours.some((hour) => isFrozen(hour.condition.kind) && (hour.precipitation ?? 0) > 0);
