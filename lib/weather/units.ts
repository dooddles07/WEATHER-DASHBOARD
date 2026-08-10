/**
 * Unit conversion and formatting.
 *
 * Everything in the normalised schema is metric: Celsius, km/h, hPa,
 * millimetres, metres. Conversion happens here, at the edge of rendering, so
 * that thresholds, colour scales and comparisons all operate on one canonical
 * set of numbers regardless of what the user has chosen to see.
 */

export type TemperatureUnit = "celsius" | "fahrenheit";
export type WindUnit = "kmh" | "mph" | "ms" | "knots";
export type PressureUnit = "hpa" | "inhg";
export type PrecipitationUnit = "mm" | "inch";
export type DistanceUnit = "km" | "miles";

export interface UnitPreferences {
  temperature: TemperatureUnit;
  wind: WindUnit;
  pressure: PressureUnit;
  precipitation: PrecipitationUnit;
  distance: DistanceUnit;
}

export const METRIC_UNITS: UnitPreferences = {
  temperature: "celsius",
  wind: "kmh",
  pressure: "hpa",
  precipitation: "mm",
  distance: "km",
};

export const IMPERIAL_UNITS: UnitPreferences = {
  temperature: "fahrenheit",
  wind: "mph",
  pressure: "inhg",
  precipitation: "inch",
  distance: "miles",
};

/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

export const celsiusToFahrenheit = (c: number) => c * (9 / 5) + 32;
export const fahrenheitToCelsius = (f: number) => (f - 32) * (5 / 9);

/**
 * A temperature *difference* converts differently from a temperature: a 5 °C
 * change is a 9 °F change, not 41 °F. Anomalies and spreads use this.
 */
export const celsiusDeltaToFahrenheit = (c: number) => c * (9 / 5);

export const kmhToMph = (v: number) => v / 1.609344;
export const kmhToMs = (v: number) => v / 3.6;
export const kmhToKnots = (v: number) => v / 1.852;

export const hpaToInHg = (v: number) => v / 33.8638866667;
export const mmToInches = (v: number) => v / 25.4;
export const metresToKm = (v: number) => v / 1000;
export const metresToMiles = (v: number) => v / 1609.344;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export interface Measurement {
  /** Converted numeric value, rounded for display. */
  value: number;
  /** Symbol shown next to the value. */
  unit: string;
  /** Value and unit together. */
  display: string;
  /** Spoken form for screen readers and chart summaries. */
  spoken: string;
}

const round = (value: number, places = 0) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export function formatTemperature(
  celsius: number,
  unit: TemperatureUnit,
  { withUnit = false, places = 0 } = {},
): Measurement {
  const value = round(
    unit === "fahrenheit" ? celsiusToFahrenheit(celsius) : celsius,
    places,
  );
  const symbol = unit === "fahrenheit" ? "°F" : "°C";
  return {
    value,
    unit: symbol,
    // Weather UIs read better with a bare degree sign; the full unit is
    // reserved for places where the scale could genuinely be ambiguous.
    display: withUnit ? `${value}${symbol}` : `${value}°`,
    spoken: `${value} degrees ${unit === "fahrenheit" ? "Fahrenheit" : "Celsius"}`,
  };
}

export function formatTemperatureDelta(
  celsiusDelta: number,
  unit: TemperatureUnit,
  { places = 1 } = {},
): Measurement {
  const value = round(
    unit === "fahrenheit" ? celsiusDeltaToFahrenheit(celsiusDelta) : celsiusDelta,
    places,
  );
  const symbol = unit === "fahrenheit" ? "°F" : "°C";
  const signed = value > 0 ? `+${value}` : `${value}`;
  return {
    value,
    unit: symbol,
    display: `${signed}${symbol}`,
    spoken: `${value > 0 ? "up" : "down"} ${Math.abs(value)} degrees`,
  };
}

const WIND_UNITS: Record<WindUnit, { convert: (v: number) => number; symbol: string; spoken: string; places: number }> = {
  kmh: { convert: (v) => v, symbol: "km/h", spoken: "kilometres per hour", places: 0 },
  mph: { convert: kmhToMph, symbol: "mph", spoken: "miles per hour", places: 0 },
  ms: { convert: kmhToMs, symbol: "m/s", spoken: "metres per second", places: 1 },
  knots: { convert: kmhToKnots, symbol: "kn", spoken: "knots", places: 0 },
};

export function formatWind(kmh: number, unit: WindUnit): Measurement {
  const spec = WIND_UNITS[unit];
  const value = round(spec.convert(kmh), spec.places);
  return {
    value,
    unit: spec.symbol,
    display: `${value} ${spec.symbol}`,
    spoken: `${value} ${spec.spoken}`,
  };
}

export function formatPressure(hpa: number, unit: PressureUnit): Measurement {
  const isInHg = unit === "inhg";
  const value = round(isInHg ? hpaToInHg(hpa) : hpa, isInHg ? 2 : 0);
  const symbol = isInHg ? "inHg" : "hPa";
  return {
    value,
    unit: symbol,
    display: `${value} ${symbol}`,
    spoken: `${value} ${isInHg ? "inches of mercury" : "hectopascals"}`,
  };
}

export function formatPrecipitation(
  mm: number,
  unit: PrecipitationUnit,
): Measurement {
  const isInch = unit === "inch";
  const value = round(isInch ? mmToInches(mm) : mm, isInch ? 2 : 1);
  const symbol = isInch ? "in" : "mm";
  return {
    value,
    unit: symbol,
    display: `${value} ${symbol}`,
    spoken: `${value} ${isInch ? "inches" : "millimetres"}`,
  };
}

export function formatDistance(metres: number, unit: DistanceUnit): Measurement {
  const isMiles = unit === "miles";
  const converted = isMiles ? metresToMiles(metres) : metresToKm(metres);
  // Sub-kilometre visibility is the case that matters most; keep a decimal.
  const value = round(converted, converted < 10 ? 1 : 0);
  const symbol = isMiles ? "mi" : "km";
  return {
    value,
    unit: symbol,
    display: `${value} ${symbol}`,
    spoken: `${value} ${isMiles ? "miles" : "kilometres"}`,
  };
}

export function formatPercent(fraction: number): Measurement {
  const value = Math.round(fraction);
  return {
    value,
    unit: "%",
    display: `${value}%`,
    spoken: `${value} percent`,
  };
}

/* -------------------------------------------------------------------------- */
/* Wind direction                                                             */
/* -------------------------------------------------------------------------- */

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

const COMPASS_SPOKEN: Record<string, string> = {
  N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast",
  E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast",
  S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest",
  W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest",
};

/**
 * Meteorological convention: the direction the wind is coming *from*. A
 * "northerly" blows from the north towards the south.
 */
export function compassPoint(degrees: number): string {
  const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS[index];
}

export const compassSpoken = (degrees: number): string =>
  COMPASS_SPOKEN[compassPoint(degrees)] ?? "variable";
