"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  IMPERIAL_UNITS,
  METRIC_UNITS,
  type UnitPreferences,
} from "@/lib/weather/units";
import type { AlertThreshold } from "@/types/alerts";
import type { GeoLocation, SavedLocation } from "@/types/location";

/**
 * User preferences.
 *
 * Everything here is local-first: favourites, units, theme and dashboard
 * layout live in the browser, so the app works immediately with no account and
 * no database. The storage engine sits behind `PreferencesStorage` below, so a
 * server-backed implementation can replace it later without any component
 * changing.
 */

export type ThemeChoice = "light" | "dark" | "system";

export type DashboardCardId =
  | "insights"
  | "scores"
  | "hourly"
  | "precipitation"
  | "daily"
  | "wind"
  | "air-quality"
  | "uv"
  | "sun-moon"
  | "pressure"
  | "map";

export const DASHBOARD_CARDS: ReadonlyArray<{ id: DashboardCardId; label: string }> = [
  { id: "insights", label: "Weather insights" },
  { id: "scores", label: "Activity scores" },
  { id: "hourly", label: "Hourly forecast" },
  { id: "precipitation", label: "Precipitation timeline" },
  { id: "daily", label: "14-day forecast" },
  { id: "map", label: "Map preview" },
  { id: "wind", label: "Wind" },
  { id: "air-quality", label: "Air quality" },
  { id: "uv", label: "UV index" },
  { id: "sun-moon", label: "Sun and moon" },
  { id: "pressure", label: "Pressure" },
];

const DEFAULT_ORDER: DashboardCardId[] = DASHBOARD_CARDS.map((card) => card.id);

interface PreferencesState {
  units: UnitPreferences;
  theme: ThemeChoice;
  /** 24-hour clock by default; dense forecast strips need the fixed width. */
  hour12: boolean;
  /** Weather-adaptive background motion. Off by default — it costs battery. */
  atmosphere: boolean;
  favorites: SavedLocation[];
  recents: GeoLocation[];
  cardOrder: DashboardCardId[];
  hiddenCards: DashboardCardId[];
  thresholds: AlertThreshold[];

  setUnits(units: Partial<UnitPreferences>): void;
  useUnitSystem(system: "metric" | "imperial"): void;
  setTheme(theme: ThemeChoice): void;
  setHour12(hour12: boolean): void;
  setAtmosphere(enabled: boolean): void;

  toggleFavorite(location: GeoLocation): void;
  renameFavorite(id: string, label: string): void;
  removeFavorite(id: string): void;
  reorderFavorites(ids: string[]): void;
  isFavorite(id: string): boolean;

  rememberRecent(location: GeoLocation): void;
  clearRecents(): void;

  toggleCard(id: DashboardCardId): void;
  setCardOrder(order: DashboardCardId[]): void;
  resetLayout(): void;

  setThreshold(threshold: AlertThreshold): void;
  removeThreshold(id: string): void;
}

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { id: "rain", metric: "precipitation-probability", value: 70, enabled: true },
  { id: "heat", metric: "temperature-above", value: 35, enabled: true },
  { id: "wind", metric: "wind-gust", value: 60, enabled: true },
  { id: "aqi", metric: "aqi", value: 100, enabled: false },
  { id: "uv", metric: "uv-index", value: 8, enabled: false },
];

const MAX_RECENTS = 6;

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      units: METRIC_UNITS,
      theme: "system",
      hour12: false,
      atmosphere: false,
      favorites: [],
      recents: [],
      cardOrder: DEFAULT_ORDER,
      hiddenCards: [],
      thresholds: DEFAULT_THRESHOLDS,

      setUnits: (units) => set((state) => ({ units: { ...state.units, ...units } })),
      useUnitSystem: (system) =>
        set({ units: system === "imperial" ? IMPERIAL_UNITS : METRIC_UNITS }),
      setTheme: (theme) => set({ theme }),
      setHour12: (hour12) => set({ hour12 }),
      setAtmosphere: (atmosphere) => set({ atmosphere }),

      toggleFavorite: (location) =>
        set((state) => {
          const existing = state.favorites.find(
            (favorite) => favorite.location.id === location.id,
          );
          if (existing) {
            return {
              favorites: state.favorites.filter(
                (favorite) => favorite.location.id !== location.id,
              ),
            };
          }
          return {
            favorites: [
              ...state.favorites,
              {
                location,
                addedAt: new Date().toISOString(),
                order: state.favorites.length,
              },
            ],
          };
        }),

      renameFavorite: (id, label) =>
        set((state) => ({
          favorites: state.favorites.map((favorite) =>
            favorite.location.id === id
              ? { ...favorite, label: label.trim() || undefined }
              : favorite,
          ),
        })),

      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((favorite) => favorite.location.id !== id),
        })),

      reorderFavorites: (ids) =>
        set((state) => ({
          favorites: ids
            .map((id, index) => {
              const favorite = state.favorites.find((entry) => entry.location.id === id);
              return favorite ? { ...favorite, order: index } : undefined;
            })
            .filter((favorite): favorite is SavedLocation => favorite !== undefined),
        })),

      isFavorite: (id) =>
        get().favorites.some((favorite) => favorite.location.id === id),

      rememberRecent: (location) =>
        set((state) => ({
          recents: [
            location,
            ...state.recents.filter((entry) => entry.id !== location.id),
          ].slice(0, MAX_RECENTS),
        })),

      clearRecents: () => set({ recents: [] }),

      toggleCard: (id) =>
        set((state) => ({
          hiddenCards: state.hiddenCards.includes(id)
            ? state.hiddenCards.filter((card) => card !== id)
            : [...state.hiddenCards, id],
        })),

      setCardOrder: (cardOrder) => set({ cardOrder }),
      resetLayout: () => set({ cardOrder: DEFAULT_ORDER, hiddenCards: [] }),

      setThreshold: (threshold) =>
        set((state) => ({
          thresholds: state.thresholds.some((entry) => entry.id === threshold.id)
            ? state.thresholds.map((entry) =>
                entry.id === threshold.id ? threshold : entry,
              )
            : [...state.thresholds, threshold],
        })),

      removeThreshold: (id) =>
        set((state) => ({
          thresholds: state.thresholds.filter((entry) => entry.id !== id),
        })),
    }),
    {
      name: "isobar-preferences",
      version: 1,
      // Actions are recreated on load; only data is persisted.
      partialize: (state) => ({
        units: state.units,
        theme: state.theme,
        hour12: state.hour12,
        atmosphere: state.atmosphere,
        favorites: state.favorites,
        recents: state.recents,
        cardOrder: state.cardOrder,
        hiddenCards: state.hiddenCards,
        thresholds: state.thresholds,
      }),
    },
  ),
);

/** Cards to render, in the user's order, with hidden ones removed. */
export function visibleCards(
  order: DashboardCardId[],
  hidden: DashboardCardId[],
): DashboardCardId[] {
  // Any card added in a later release is appended rather than lost.
  const known = new Set(order);
  const complete = [...order, ...DEFAULT_ORDER.filter((id) => !known.has(id))];
  return complete.filter((id) => !hidden.includes(id));
}
