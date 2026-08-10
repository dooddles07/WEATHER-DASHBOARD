import { cacheLife } from "next/cache";
import { z } from "zod";

import { fetchJson } from "@/server/weather/fetchWithGuard";

/**
 * RainViewer radar and satellite frames.
 *
 * Genuinely free and key-free, and the only open source of animated composite
 * radar with global coverage. The index lists roughly two hours of past frames
 * at ten-minute spacing plus a half-hour nowcast, which is what the timeline
 * scrubs through.
 */

const RainViewerIndex = z.object({
  host: z.string(),
  radar: z
    .object({
      past: z.array(z.object({ time: z.number(), path: z.string() })).default([]),
      nowcast: z.array(z.object({ time: z.number(), path: z.string() })).default([]),
    })
    .optional(),
  satellite: z
    .object({
      infrared: z.array(z.object({ time: z.number(), path: z.string() })).default([]),
    })
    .optional(),
});

export interface RadarFrame {
  /** UTC ISO instant the frame represents. */
  time: string;
  /** Tile URL template with `{z}`, `{x}` and `{y}` placeholders. */
  tileUrl: string;
  /** Forecast frames are extrapolated, not observed, and are labelled so. */
  forecast: boolean;
}

export interface RadarIndex {
  frames: RadarFrame[];
  satellite: RadarFrame[];
  /** Index of the most recent observed frame — where the playhead starts. */
  nowIndex: number;
  attribution: string;
}

/**
 * Colour scheme 4 is the Nexrad-style ramp, which reads as precipitation
 * intensity to anyone who has seen a weather map. `1_1` turns on smoothing and
 * snow shading.
 */
const TILE_OPTIONS = "256/{z}/{x}/{y}/4/1_1.png";
const SATELLITE_OPTIONS = "256/{z}/{x}/{y}/0/0_0.png";

async function fetchRadarIndex(): Promise<RadarIndex | undefined> {
  "use cache";
  cacheLife("radarIndex");

  const result = await fetchJson("https://api.rainviewer.com/public/weather-maps.json", {
    subsystem: "radar",
    schema: RainViewerIndex,
    revalidate: 60,
  });

  if (!result.ok) return undefined;

  const { host, radar, satellite } = result.data;

  const past: RadarFrame[] = (radar?.past ?? []).map((frame) => ({
    time: new Date(frame.time * 1000).toISOString(),
    tileUrl: `${host}${frame.path}/${TILE_OPTIONS}`,
    forecast: false,
  }));

  const nowcast: RadarFrame[] = (radar?.nowcast ?? []).map((frame) => ({
    time: new Date(frame.time * 1000).toISOString(),
    tileUrl: `${host}${frame.path}/${TILE_OPTIONS}`,
    forecast: true,
  }));

  const infrared: RadarFrame[] = (satellite?.infrared ?? []).map((frame) => ({
    time: new Date(frame.time * 1000).toISOString(),
    tileUrl: `${host}${frame.path}/${SATELLITE_OPTIONS}`,
    forecast: false,
  }));

  if (past.length === 0 && nowcast.length === 0) return undefined;

  return {
    frames: [...past, ...nowcast],
    satellite: infrared,
    nowIndex: Math.max(0, past.length - 1),
    attribution: "Radar and satellite imagery © RainViewer",
  };
}

export const getRadarIndex = fetchRadarIndex;
