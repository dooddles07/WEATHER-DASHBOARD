"use client";

import { useEffect } from "react";
import { create } from "zustand";

import type { WeatherCondition } from "@/types/weather";

/**
 * The ambient reading for the place currently being viewed.
 *
 * Published by whichever page has weather data, and consumed by chrome that
 * sits outside the page — the wordmark's contour tint, and the optional
 * atmosphere layer. Keeping it in a store avoids re-fetching the same
 * observation in the layout just to colour a logo.
 *
 * It stays undefined until real data arrives. Nothing here invents a value.
 */

interface AmbientState {
  temperature?: number;
  condition?: WeatherCondition;
  isDay?: boolean;
  set(reading: {
    temperature?: number;
    condition?: WeatherCondition;
    isDay?: boolean;
  }): void;
}

export const useAmbient = create<AmbientState>()((set) => ({
  set: (reading) => set(reading),
}));

/** Publishes the current reading from a page that has one. */
export function usePublishAmbient(reading: {
  temperature?: number;
  condition?: WeatherCondition;
  isDay?: boolean;
}): void {
  const publish = useAmbient((store) => store.set);
  const { temperature, condition, isDay } = reading;

  useEffect(() => {
    publish({ temperature, condition, isDay });
  }, [publish, temperature, condition, isDay]);
}
