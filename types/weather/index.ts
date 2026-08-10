import type { PrecipitationIntensity } from "@/lib/weather/scales";
import type { GeoLocation } from "@/types/location";

/**
 * The normalised weather schema.
 *
 * Nothing downstream of `lib/weather/normalize.ts` ever sees a provider's own
 * shape. Canonical units are metric — Celsius, km/h, hPa, millimetres, metres
 * — and conversion happens at render time, so a value's colour and its
 * comparison against a threshold never depend on the user's display settings.
 *
 * Every field a provider may omit is optional. Consumers render a per-field
 * unavailable state rather than assuming presence.
 */

export type ConditionKind =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "freezing-drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "snow-grains"
  | "showers"
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail"
  | "unknown";

export interface WeatherCondition {
  /** WMO 4677 present-weather code, kept for traceability. */
  code: number;
  kind: ConditionKind;
  label: string;
  /** Key into the weather glyph set; resolved against `isDay` at render. */
  glyph: string;
  /** Coarse hint used to order insights and pick ribbon treatments. */
  disposition: "calm" | "unsettled" | "severe";
}

export interface CurrentWeather {
  observedAt: string;
  isDay: boolean;
  temperature: number;
  feelsLike: number;
  humidity?: number;
  dewPoint?: number;
  /** Mean sea level pressure, hPa. */
  pressure?: number;
  /** Metres. */
  visibility?: number;
  cloudCover?: number;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
  precipitation?: number;
  uvIndex?: number;
  condition: WeatherCondition;
}

export interface HourPoint {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitationProbability?: number;
  precipitation?: number;
  rain?: number;
  showers?: number;
  snowfall?: number;
  humidity?: number;
  dewPoint?: number;
  pressure?: number;
  cloudCover?: number;
  visibility?: number;
  windSpeed: number;
  windGust?: number;
  windDirection: number;
  uvIndex?: number;
  isDay: boolean;
  condition: WeatherCondition;
  /** Convective available potential energy, J/kg — drives thunderstorm risk. */
  cape?: number;
  freezingLevel?: number;
}

export interface DayPoint {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  feelsLikeMax?: number;
  feelsLikeMin?: number;
  precipitationSum?: number;
  rainSum?: number;
  snowfallSum?: number;
  precipitationHours?: number;
  precipitationProbabilityMax?: number;
  windSpeedMax?: number;
  windGustMax?: number;
  windDirectionDominant?: number;
  uvIndexMax?: number;
  sunrise?: string;
  sunset?: string;
  daylightSeconds?: number;
  sunshineSeconds?: number;
  condition: WeatherCondition;
}

export interface NowcastStep {
  time: string;
  /** Millimetres falling within this step. */
  precipitation: number;
  /** Equivalent hourly rate, which is what the intensity words describe. */
  ratePerHour: number;
  intensity: PrecipitationIntensity;
}

export interface PrecipitationNowcast {
  resolutionMinutes: number;
  steps: NowcastStep[];
  /**
   * Open-Meteo only has genuine 15-minute radar-derived data over Central
   * Europe and North America. Elsewhere the steps are interpolated from the
   * hourly forecast, and the UI says so rather than implying radar precision.
   */
  highResolution: boolean;
  /** First step with measurable precipitation, if any lies ahead. */
  startsAt?: string;
  /** First dry step after `startsAt`. */
  endsAt?: string;
  totalMm: number;
}

export interface AirQuality {
  observedAt: string;
  usAqi?: number;
  europeanAqi?: number;
  /** All concentrations in µg/m³. */
  pm25?: number;
  pm10?: number;
  ozone?: number;
  nitrogenDioxide?: number;
  sulphurDioxide?: number;
  carbonMonoxide?: number;
  dust?: number;
  /** Grains/m³. Europe only — the provider has no global pollen model. */
  pollen?: {
    alder?: number;
    birch?: number;
    grass?: number;
    mugwort?: number;
    olive?: number;
    ragweed?: number;
  };
}

export interface Astronomy {
  date: string;
  sunrise?: string;
  sunset?: string;
  solarNoon?: string;
  daylightSeconds?: number;
  moonrise?: string;
  moonset?: string;
  /** 0 = new, 0.5 = full, approaching 1 = new again. */
  moonPhase: number;
  moonPhaseLabel: string;
  /** Fraction of the disc lit, 0–1. */
  moonIllumination: number;
}

/**
 * Agreement between independent numerical models for the same location.
 * Genuine forecast uncertainty, not a made-up percentage.
 */
export interface ForecastConfidence {
  models: string[];
  /** Maximum spread in daily max temperature across models, °C. */
  temperatureSpread: number;
  /** Widest disagreement in daily precipitation total, mm. */
  precipitationSpread: number;
  level: "high" | "moderate" | "low";
}

export type Subsystem =
  | "forecast"
  | "nowcast"
  | "air-quality"
  | "alerts"
  | "radar"
  | "storms"
  | "archive"
  | "geocoding"
  | "map-layers";

export type DegradationReason =
  | "timeout"
  | "rate-limited"
  | "provider-error"
  | "malformed"
  | "unavailable"
  | "not-configured";

/**
 * Recorded rather than thrown. One failing subsystem darkens one panel; the
 * rest of the dashboard renders normally.
 */
export interface Degradation {
  subsystem: Subsystem;
  reason: DegradationReason;
  /** Written for a person, never a raw provider error. */
  message: string;
  /** Set when we fell back to a cached copy instead of failing outright. */
  servedFrom?: string;
}

export interface WeatherBundle {
  location: GeoLocation;
  /** When this data left the provider. Drives the freshness indicator. */
  fetchedAt: string;
  current?: CurrentWeather;
  hourly: HourPoint[];
  daily: DayPoint[];
  nowcast?: PrecipitationNowcast;
  airQuality?: AirQuality;
  astronomy: Astronomy[];
  degraded: Degradation[];
}

export interface HistoricalObservation {
  date: string;
  temperatureMax?: number;
  temperatureMin?: number;
  temperatureMean?: number;
  precipitationSum?: number;
  windSpeedMax?: number;
  pressureMean?: number;
  humidityMean?: number;
}

export interface ClimateNormal {
  /** Calendar month, 1–12. */
  month: number;
  temperatureMeanMax: number;
  temperatureMeanMin: number;
  precipitationMean: number;
  /** Years of archive data the mean was computed from. */
  sampleYears: number;
}
