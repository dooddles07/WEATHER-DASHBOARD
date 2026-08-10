import type { ConditionKind, WeatherCondition } from "@/types/weather";

/**
 * WMO code 4677 present-weather codes, as emitted by Open-Meteo.
 *
 * The `glyph` key selects from the custom weather icon set rather than an
 * off-the-shelf icon pack — general-purpose packs have three weather icons and
 * no way to distinguish freezing drizzle from snow grains. Glyphs that vary by
 * time of day are marked `dayNight` and resolved against `isDay` at render.
 */

interface CodeDefinition {
  kind: ConditionKind;
  label: string;
  glyph: string;
  disposition: WeatherCondition["disposition"];
}

const CODES: Record<number, CodeDefinition> = {
  0: { kind: "clear", label: "Clear", glyph: "clear", disposition: "calm" },
  1: {
    kind: "mostly-clear",
    label: "Mostly clear",
    glyph: "mostly-clear",
    disposition: "calm",
  },
  2: {
    kind: "partly-cloudy",
    label: "Partly cloudy",
    glyph: "partly-cloudy",
    disposition: "calm",
  },
  3: { kind: "overcast", label: "Overcast", glyph: "overcast", disposition: "calm" },

  45: { kind: "fog", label: "Fog", glyph: "fog", disposition: "unsettled" },
  48: {
    kind: "fog",
    label: "Freezing fog",
    glyph: "fog",
    disposition: "unsettled",
  },

  51: {
    kind: "drizzle",
    label: "Light drizzle",
    glyph: "drizzle",
    disposition: "unsettled",
  },
  53: { kind: "drizzle", label: "Drizzle", glyph: "drizzle", disposition: "unsettled" },
  55: {
    kind: "drizzle",
    label: "Heavy drizzle",
    glyph: "drizzle",
    disposition: "unsettled",
  },
  56: {
    kind: "freezing-drizzle",
    label: "Light freezing drizzle",
    glyph: "freezing-rain",
    disposition: "severe",
  },
  57: {
    kind: "freezing-drizzle",
    label: "Freezing drizzle",
    glyph: "freezing-rain",
    disposition: "severe",
  },

  61: { kind: "rain", label: "Light rain", glyph: "rain-light", disposition: "unsettled" },
  63: { kind: "rain", label: "Rain", glyph: "rain", disposition: "unsettled" },
  65: { kind: "rain", label: "Heavy rain", glyph: "rain-heavy", disposition: "severe" },
  66: {
    kind: "freezing-rain",
    label: "Light freezing rain",
    glyph: "freezing-rain",
    disposition: "severe",
  },
  67: {
    kind: "freezing-rain",
    label: "Freezing rain",
    glyph: "freezing-rain",
    disposition: "severe",
  },

  71: { kind: "snow", label: "Light snow", glyph: "snow-light", disposition: "unsettled" },
  73: { kind: "snow", label: "Snow", glyph: "snow", disposition: "unsettled" },
  75: { kind: "snow", label: "Heavy snow", glyph: "snow-heavy", disposition: "severe" },
  77: {
    kind: "snow-grains",
    label: "Snow grains",
    glyph: "snow-light",
    disposition: "unsettled",
  },

  80: {
    kind: "showers",
    label: "Light showers",
    glyph: "showers",
    disposition: "unsettled",
  },
  81: { kind: "showers", label: "Showers", glyph: "showers", disposition: "unsettled" },
  82: {
    kind: "showers",
    label: "Violent showers",
    glyph: "showers-heavy",
    disposition: "severe",
  },
  85: {
    kind: "snow-showers",
    label: "Snow showers",
    glyph: "snow-showers",
    disposition: "unsettled",
  },
  86: {
    kind: "snow-showers",
    label: "Heavy snow showers",
    glyph: "snow-showers",
    disposition: "severe",
  },

  95: {
    kind: "thunderstorm",
    label: "Thunderstorm",
    glyph: "thunderstorm",
    disposition: "severe",
  },
  96: {
    kind: "thunderstorm-hail",
    label: "Thunderstorm with hail",
    glyph: "thunderstorm-hail",
    disposition: "severe",
  },
  99: {
    kind: "thunderstorm-hail",
    label: "Thunderstorm with heavy hail",
    glyph: "thunderstorm-hail",
    disposition: "severe",
  },
};

const UNKNOWN: CodeDefinition = {
  kind: "unknown",
  label: "Conditions unavailable",
  glyph: "unknown",
  disposition: "calm",
};

/** Glyphs that have a distinct night form. */
const DAY_NIGHT_GLYPHS = new Set([
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "showers",
  "showers-heavy",
  "snow-showers",
]);

export function conditionFromCode(code: number | undefined | null): WeatherCondition {
  const definition = code == null ? UNKNOWN : (CODES[code] ?? UNKNOWN);
  return {
    code: code ?? -1,
    kind: definition.kind,
    label: definition.label,
    glyph: definition.glyph,
    disposition: definition.disposition,
  };
}

/** Resolves a glyph key to its day or night variant. */
export function glyphFor(condition: WeatherCondition, isDay: boolean): string {
  if (isDay || !DAY_NIGHT_GLYPHS.has(condition.glyph)) return condition.glyph;
  return `${condition.glyph}-night`;
}

export const isPrecipitating = (kind: ConditionKind): boolean =>
  kind === "drizzle" ||
  kind === "freezing-drizzle" ||
  kind === "rain" ||
  kind === "freezing-rain" ||
  kind === "snow" ||
  kind === "snow-grains" ||
  kind === "showers" ||
  kind === "snow-showers" ||
  kind === "thunderstorm" ||
  kind === "thunderstorm-hail";

export const isFrozen = (kind: ConditionKind): boolean =>
  kind === "snow" ||
  kind === "snow-grains" ||
  kind === "snow-showers" ||
  kind === "freezing-rain" ||
  kind === "freezing-drizzle";
