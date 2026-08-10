import type { SeverityLevel } from "@/lib/weather/scales";

export type AlertCategory =
  | "thunderstorm"
  | "rain"
  | "flood"
  | "tropical-cyclone"
  | "heat"
  | "cold"
  | "wind"
  | "lightning"
  | "air-quality"
  | "fog"
  | "snow-ice"
  | "uv"
  | "marine"
  | "other";

/**
 * Where an alert came from, and how much authority it carries.
 *
 * `official` alerts are issued by a meteorological agency. `derived` alerts are
 * computed by this app from real forecast data against published thresholds —
 * useful where no free official feed exists, but never presented as if an
 * agency issued them.
 */
export type AlertOrigin = "official" | "derived";

export interface WeatherAlert {
  id: string;
  origin: AlertOrigin;
  /** Human-readable attribution, shown on every alert. */
  source: string;
  severity: SeverityLevel;
  category: AlertCategory;
  headline: string;
  description: string;
  /** What the issuing agency recommends doing. */
  instruction?: string;
  areas: string[];
  effective: string;
  expires?: string;
  /** Link to the authoritative bulletin, for official alerts. */
  url?: string;
  /** For derived alerts: the rule that produced it, shown in the UI. */
  basis?: string;
}

export type StormCategory =
  | "tropical-depression"
  | "tropical-storm"
  | "category-1"
  | "category-2"
  | "category-3"
  | "category-4"
  | "category-5"
  | "post-tropical";

export interface StormPosition {
  time: string;
  latitude: number;
  longitude: number;
  /** Sustained wind, km/h. */
  windSpeed?: number;
  /** Minimum central pressure, hPa. */
  pressure?: number;
  category?: StormCategory;
}

export interface TropicalCyclone {
  id: string;
  name: string;
  basin: string;
  category: StormCategory;
  current: StormPosition;
  /** Direction of travel in degrees, and speed in km/h. */
  movementDirection?: number;
  movementSpeed?: number;
  /** Observed positions so far. */
  history: StormPosition[];
  /** Official forecast positions. */
  forecast: StormPosition[];
  /**
   * Forecast cone as a GeoJSON polygon ring, when the agency publishes one.
   * Absent is a normal state, not an error.
   */
  cone?: Array<[number, number]>;
  advisoryUrl?: string;
  lastAdvisory?: string;
}

export interface AlertThreshold {
  id: string;
  metric:
    | "precipitation-probability"
    | "temperature-above"
    | "temperature-below"
    | "wind-speed"
    | "wind-gust"
    | "aqi"
    | "uv-index";
  value: number;
  enabled: boolean;
}
