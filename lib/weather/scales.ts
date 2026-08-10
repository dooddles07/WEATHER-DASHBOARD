/**
 * Every chromatic value in ISOBAR is defined here.
 *
 * The interface shell is achromatic by rule — if something on screen has a
 * hue, it encodes a measurement, and that mapping lives in this file. Charts,
 * SVG, map legends and CSS all read these scales so a given temperature is the
 * same colour everywhere in the product.
 *
 * Continuous ramps interpolate through Oklab rather than sRGB. Straight sRGB
 * interpolation darkens and desaturates through the middle of a ramp, which
 * puts a muddy band right where most temperatures actually fall.
 */

export interface ColorStop {
  /** Value in the scale's own units. */
  readonly at: number;
  readonly color: string;
}

export interface Band {
  readonly min: number;
  readonly max: number;
  readonly label: string;
  /** Fill colour. Always paired with `label` — colour is never the only cue. */
  readonly color: string;
  /** Text colour that meets 4.5:1 against `color`. */
  readonly on: string;
}

/* -------------------------------------------------------------------------- */
/* Colour space                                                               */
/* -------------------------------------------------------------------------- */

type Rgb = readonly [number, number, number];
type Oklab = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function rgbToHex([r, g, b]: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toGamma = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function rgbToOklab([r, g, b]: Rgb): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, bb]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Samples a stop list at `value`, interpolating in Oklab. Values outside the
 * stop range clamp to the end stops rather than extrapolating, so an extreme
 * reading stays inside the documented palette.
 */
export function sampleRamp(stops: readonly ColorStop[], value: number): string {
  if (stops.length === 0) return "#000000";

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (value <= first.at) return first.color;
  if (value >= last.at) return last.color;

  let lower = first;
  let upper = last;
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (value >= stops[i].at && value <= stops[i + 1].at) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const span = upper.at - lower.at;
  const t = span === 0 ? 0 : (value - lower.at) / span;

  const a = rgbToOklab(hexToRgb(lower.color));
  const b = rgbToOklab(hexToRgb(upper.color));

  return rgbToHex(
    oklabToRgb([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]),
  );
}

/** Evenly sampled CSS gradient for legends and chart fills. */
export function rampGradient(
  stops: readonly ColorStop[],
  { steps = 12, angle = "90deg" }: { steps?: number; angle?: string } = {},
): string {
  const min = stops[0].at;
  const max = stops[stops.length - 1].at;
  const swatches = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return `${sampleRamp(stops, min + (max - min) * t)} ${(t * 100).toFixed(1)}%`;
  });
  return `linear-gradient(${angle}, ${swatches.join(", ")})`;
}

/* -------------------------------------------------------------------------- */
/* Temperature                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Diverging ramp pivoting on 16 °C — roughly the point where most people stop
 * describing weather as cold and start describing it as mild. Domain is
 * always Celsius; convert before sampling so the colour of a given temperature
 * never depends on the user's display units.
 */
export const TEMPERATURE_STOPS: readonly ColorStop[] = [
  { at: -25, color: "#3b4cc0" },
  { at: -10, color: "#5d8fd6" },
  { at: 2, color: "#8fc3e8" },
  { at: 16, color: "#e8e3c2" },
  { at: 26, color: "#f2b366" },
  { at: 34, color: "#e4703a" },
  { at: 44, color: "#b32b2b" },
];

export const temperatureColor = (celsius: number) =>
  sampleRamp(TEMPERATURE_STOPS, celsius);

/* -------------------------------------------------------------------------- */
/* Precipitation                                                              */
/* -------------------------------------------------------------------------- */

/** Rain intensity in mm/h. Stops line up with the categories below. */
export const RAIN_STOPS: readonly ColorStop[] = [
  { at: 0.1, color: "#bfd9e8" },
  { at: 1, color: "#5aa9d6" },
  { at: 4, color: "#2e6fb0" },
  { at: 10, color: "#1e3f8c" },
  { at: 30, color: "#152a63" },
];

/** Frozen precipitation gets its own hue family so it never reads as rain. */
export const SNOW_STOPS: readonly ColorStop[] = [
  { at: 0.1, color: "#d7e3f7" },
  { at: 1, color: "#a9c7f2" },
  { at: 5, color: "#8a7fd0" },
  { at: 15, color: "#6c5fb8" },
];

export const rainColor = (mmPerHour: number) =>
  sampleRamp(RAIN_STOPS, mmPerHour);

export const snowColor = (mmPerHour: number) =>
  sampleRamp(SNOW_STOPS, mmPerHour);

export type PrecipitationIntensity =
  | "none"
  | "drizzle"
  | "light"
  | "moderate"
  | "heavy"
  | "violent";

/**
 * Meteorological rain-rate categories (mm/h). These thresholds follow common
 * synoptic practice and are what the precipitation timeline labels against.
 */
export function precipitationIntensity(
  mmPerHour: number,
): PrecipitationIntensity {
  if (mmPerHour <= 0) return "none";
  if (mmPerHour < 0.5) return "drizzle";
  if (mmPerHour < 2.5) return "light";
  if (mmPerHour < 7.6) return "moderate";
  if (mmPerHour < 50) return "heavy";
  return "violent";
}

export const PRECIPITATION_INTENSITY_LABEL: Record<
  PrecipitationIntensity,
  string
> = {
  none: "No precipitation",
  drizzle: "Drizzle",
  light: "Light rain",
  moderate: "Moderate rain",
  heavy: "Heavy rain",
  violent: "Violent rain",
};

/* -------------------------------------------------------------------------- */
/* Air quality                                                                */
/* -------------------------------------------------------------------------- */

/**
 * US EPA AQI bands. The published EPA swatches are fully saturated and fail
 * contrast as soon as text sits on them, so each band keeps the standard's hue
 * identity at a luminance that clears 4.5:1. The category name is always
 * rendered alongside the colour.
 */
export const AQI_BANDS: readonly Band[] = [
  { min: 0, max: 50, label: "Good", color: "#3e8e5a", on: "#ffffff" },
  { min: 51, max: 100, label: "Moderate", color: "#8a7000", on: "#ffffff" },
  {
    min: 101,
    max: 150,
    label: "Unhealthy for sensitive groups",
    color: "#c2611f",
    on: "#ffffff",
  },
  { min: 151, max: 200, label: "Unhealthy", color: "#b3352f", on: "#ffffff" },
  {
    min: 201,
    max: 300,
    label: "Very unhealthy",
    color: "#7a3b8f",
    on: "#ffffff",
  },
  {
    min: 301,
    max: Number.POSITIVE_INFINITY,
    label: "Hazardous",
    color: "#6e1a2b",
    on: "#ffffff",
  },
];

/* -------------------------------------------------------------------------- */
/* UV                                                                          */
/* -------------------------------------------------------------------------- */

/** WHO UV Index bands. */
export const UV_BANDS: readonly Band[] = [
  { min: 0, max: 2.9, label: "Low", color: "#3e8e5a", on: "#ffffff" },
  { min: 3, max: 5.9, label: "Moderate", color: "#8a7000", on: "#ffffff" },
  { min: 6, max: 7.9, label: "High", color: "#c2611f", on: "#ffffff" },
  { min: 8, max: 10.9, label: "Very high", color: "#b3352f", on: "#ffffff" },
  {
    min: 11,
    max: Number.POSITIVE_INFINITY,
    label: "Extreme",
    color: "#7a3b8f",
    on: "#ffffff",
  },
];

export function bandFor(bands: readonly Band[], value: number): Band {
  return (
    bands.find((band) => value >= band.min && value <= band.max) ??
    bands[bands.length - 1]
  );
}

/* -------------------------------------------------------------------------- */
/* Alert severity                                                             */
/* -------------------------------------------------------------------------- */

export type SeverityLevel =
  | "information"
  | "advisory"
  | "watch"
  | "warning"
  | "emergency";

export const SEVERITY_ORDER: readonly SeverityLevel[] = [
  "information",
  "advisory",
  "watch",
  "warning",
  "emergency",
];

export interface SeverityStyle {
  readonly label: string;
  readonly color: string;
  readonly on: string;
  /**
   * Redundant non-colour encoding. Severity must survive greyscale, colour
   * blindness and a printed page, so every alert also carries a fill pattern
   * and the level spelled out.
   */
  readonly pattern: "none" | "hatch" | "hatch-dense" | "solid";
  readonly weight: number;
}

export const SEVERITY: Record<SeverityLevel, SeverityStyle> = {
  information: {
    label: "Information",
    color: "#4a7fb5",
    on: "#ffffff",
    pattern: "none",
    weight: 1,
  },
  advisory: {
    label: "Advisory",
    color: "#8a6410",
    on: "#ffffff",
    pattern: "hatch",
    weight: 2,
  },
  watch: {
    label: "Watch",
    color: "#c7622c",
    on: "#ffffff",
    pattern: "hatch",
    weight: 3,
  },
  warning: {
    label: "Warning",
    color: "#b3352f",
    on: "#ffffff",
    pattern: "hatch-dense",
    weight: 4,
  },
  emergency: {
    label: "Emergency",
    color: "#7a1f5c",
    on: "#ffffff",
    pattern: "solid",
    weight: 5,
  },
};

export const highestSeverity = (
  levels: readonly SeverityLevel[],
): SeverityLevel | undefined =>
  levels.length === 0
    ? undefined
    : levels.reduce((worst, level) =>
        SEVERITY[level].weight > SEVERITY[worst].weight ? level : worst,
      );

/* -------------------------------------------------------------------------- */
/* Sky luminance                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Background luminance for a moment in the day, driven by solar elevation
 * rather than clock time so it stays correct at high latitudes and across
 * seasons. Returns 0 (deep night) to 1 (full day).
 */
export function daylightFactor(solarElevationDegrees: number): number {
  // Civil twilight runs to -6°; treat -12° as fully dark and +6° as full day.
  return clamp((solarElevationDegrees + 12) / 18, 0, 1);
}
