"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/primitives";
import type { WeatherMapProps } from "@/components/maps/WeatherMap";

/**
 * Defers MapLibre until the map is actually on screen.
 *
 * `ssr: false` is not optional here: MapLibre touches `window` and WebGL at
 * import time. Splitting it out also keeps roughly 200 kB of map engine off
 * every other route.
 */
const WeatherMap = dynamic(
  () => import("@/components/maps/WeatherMap").then((module) => module.WeatherMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-[clamp(24rem,68dvh,52rem)] w-full rounded-md" />
    ),
  },
);

export function MapPanel(props: WeatherMapProps) {
  return <WeatherMap {...props} />;
}
