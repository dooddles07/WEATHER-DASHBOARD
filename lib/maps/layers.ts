import {
  rampGradient,
  RAIN_STOPS,
  TEMPERATURE_STOPS,
  type ColorStop,
} from "@/lib/weather/scales";

/**
 * The map's overlay layers.
 *
 * Two families, and the difference matters to the user: RainViewer's radar and
 * satellite are *observations* of what is actually there, while the
 * OpenWeatherMap fields are *model output*. The legend says which is which,
 * because a radar echo and a modelled pressure field deserve different levels
 * of trust.
 *
 * Every layer that needs a key is proxied through `/api/tiles/owm`, so no
 * credential ever reaches the browser.
 */

export type MapLayerId =
  | "none"
  | "radar"
  | "satellite"
  | "temperature"
  | "precipitation"
  | "wind"
  | "pressure"
  | "clouds";

export interface MapLayerDefinition {
  id: MapLayerId;
  label: string;
  /** One line explaining what the layer shows and where it comes from. */
  description: string;
  source: "RainViewer" | "OpenWeatherMap" | "none";
  kind: "observation" | "model" | "none";
  /** Undefined for the animated layers, whose URLs come from the frame index. */
  tileUrl?: string;
  /** Legend swatches. Continuous ramps use `gradient`, bands use `stops`. */
  legend?: {
    gradient?: string;
    unit: string;
    /** Labels beneath the gradient, left to right. */
    ticks: string[];
  };
  /** Requires OPENWEATHER_API_KEY to be configured. */
  needsKey?: boolean;
}

const owmTiles = (layer: string) => `/api/tiles/owm/${layer}/{z}/{x}/{y}`;

/** Legend for a ramp, sampled at the ends and middle. */
const rampLegend = (
  stops: readonly ColorStop[],
  unit: string,
  ticks: string[],
): MapLayerDefinition["legend"] => ({
  gradient: rampGradient(stops, { steps: 14 }),
  unit,
  ticks,
});

export const MAP_LAYERS: readonly MapLayerDefinition[] = [
  {
    id: "none",
    label: "None",
    description: "Base map only.",
    source: "none",
    kind: "none",
  },
  {
    id: "radar",
    label: "Radar",
    description:
      "Composite precipitation radar. Observed, updated every ten minutes, with a thirty-minute nowcast.",
    source: "RainViewer",
    kind: "observation",
    legend: rampLegend(RAIN_STOPS, "mm/h", ["0.1", "1", "4", "10", "30+"]),
  },
  {
    id: "satellite",
    label: "Satellite",
    description: "Infrared satellite imagery. Cloud-top temperature, observed.",
    source: "RainViewer",
    kind: "observation",
  },
  {
    id: "temperature",
    label: "Temperature",
    description: "Modelled air temperature at two metres.",
    source: "OpenWeatherMap",
    kind: "model",
    tileUrl: owmTiles("temperature"),
    needsKey: true,
    legend: rampLegend(TEMPERATURE_STOPS, "°C", ["−25", "0", "16", "30", "44"]),
  },
  {
    id: "precipitation",
    label: "Precipitation",
    description: "Modelled precipitation intensity.",
    source: "OpenWeatherMap",
    kind: "model",
    tileUrl: owmTiles("precipitation"),
    needsKey: true,
    legend: rampLegend(RAIN_STOPS, "mm/h", ["0.1", "1", "4", "10", "30+"]),
  },
  {
    id: "wind",
    label: "Wind",
    description: "Modelled wind speed at ten metres.",
    source: "OpenWeatherMap",
    kind: "model",
    tileUrl: owmTiles("wind"),
    needsKey: true,
  },
  {
    id: "pressure",
    label: "Pressure",
    description: "Modelled mean sea level pressure.",
    source: "OpenWeatherMap",
    kind: "model",
    tileUrl: owmTiles("pressure"),
    needsKey: true,
  },
  {
    id: "clouds",
    label: "Cloud cover",
    description: "Modelled cloud cover.",
    source: "OpenWeatherMap",
    kind: "model",
    tileUrl: owmTiles("clouds"),
    needsKey: true,
  },
];

export const layerById = (id: MapLayerId): MapLayerDefinition =>
  MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0];

/**
 * OpenFreeMap serves these without a key or a signup, which is what keeps the
 * map working on a fresh clone with no configuration at all.
 */
export const BASE_STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/fiord",
} as const;
