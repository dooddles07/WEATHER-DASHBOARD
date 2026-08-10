"use client";

import { Check, Columns3, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button, Panel, Skeleton } from "@/components/ui/primitives";
import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { SUGGESTED_LOCATIONS } from "@/lib/locations/places";
import { usePreferences } from "@/lib/stores/preferences";
import { formatHour, formatZoneOffset } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import { temperatureColor } from "@/lib/weather/scales";
import {
  formatPercent,
  formatTemperature,
  formatWind,
} from "@/lib/weather/units";
import { glyphFor } from "@/lib/weather/wmo";
import type { GeoLocation } from "@/types/location";
import type { CurrentWeather, DayPoint } from "@/types/weather";

/**
 * Several cities, side by side.
 *
 * The point of a comparison is the *difference*, so each row marks its own
 * best and worst value rather than leaving the reader to scan five numbers and
 * work it out. "Best" is defined per metric — the warmest is best for
 * temperature, the least is best for rain — which is a judgement, so the
 * marking is a subtle rule rather than a verdict.
 */

interface Snapshot {
  latitude: number;
  longitude: number;
  timezone: string;
  current: CurrentWeather;
  today?: DayPoint;
}

const key = (location: GeoLocation) =>
  `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;

const MAX_COLUMNS = 5;

export function CompareView({ initial }: { initial: GeoLocation[] }) {
  const units = usePreferences((store) => store.units);
  const hour12 = usePreferences((store) => store.hour12);
  const favorites = usePreferences((store) => store.favorites);

  const [selected, setSelected] = useState<GeoLocation[]>(initial.slice(0, 3));
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);

  /** Everything the user could add, without duplicating what is already shown. */
  const candidates = useMemo(() => {
    const chosen = new Set(selected.map((location) => location.id));
    const pool = [
      ...favorites.map((favorite) => favorite.location),
      ...SUGGESTED_LOCATIONS,
    ];
    const seen = new Set<string>();
    return pool.filter(
      (location) =>
        !chosen.has(location.id) && !seen.has(location.id) && seen.add(location.id),
    );
  }, [favorites, selected]);

  useEffect(() => {
    if (selected.length === 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

    const points = selected
      .map((location) => `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`)
      .join(";");

    fetch(`/api/compare?points=${encodeURIComponent(points)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as { snapshots: Snapshot[] };
      })
      .then((body) => {
        const next: Record<string, Snapshot> = {};
        for (const snapshot of body.snapshots) {
          next[`${snapshot.latitude.toFixed(2)},${snapshot.longitude.toFixed(2)}`] =
            snapshot;
        }
        setSnapshots(next);
      })
      .catch((cause: Error) => {
        if (cause.name === "AbortError") return;
        setError("Comparison data could not be loaded. Try again in a moment.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selected]);

  const rows = useMemo(
    () => buildRows(selected, snapshots, units, hour12),
    [selected, snapshots, units, hour12],
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Compare</h1>
        <p className="text-xs text-tertiary">
          Up to five places at once. Each row marks the highest and lowest value.
        </p>
      </header>

      {error ? (
        <Panel surface="sunken" className="p-4">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}

      {selected.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-8">
          <Columns3 className="size-6 text-tertiary" aria-hidden />
          <p className="text-sm font-medium">Nothing to compare yet</p>
          <p className="max-w-prose text-xs leading-relaxed text-tertiary">
            Add at least two places to see them side by side.
          </p>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="scroll-region overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">
                Current conditions compared across {selected.length} locations
              </caption>

              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="label-micro p-3">
                    Metric
                  </th>
                  {selected.map((location) => {
                    const snapshot = snapshots[key(location)];
                    return (
                      <th key={location.id} scope="col" className="p-3 align-top">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-sm font-semibold">
                              {location.name}
                            </span>
                            <span className="measured text-[10px] font-normal text-tertiary">
                              {formatZoneOffset(location.timezone)}
                              {snapshot
                                ? ` · ${formatHour(snapshot.current.observedAt, location.timezone, { hour12 })}`
                                : ""}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-label={`Remove ${location.name} from the comparison`}
                            onClick={() =>
                              setSelected((current) =>
                                current.filter((entry) => entry.id !== location.id),
                              )
                            }
                            className="shrink-0 cursor-pointer rounded-sm p-1 text-tertiary hover:text-primary"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {loading
                  ? Array.from({ length: 8 }, (_, index) => (
                      <tr key={index} className="border-b border-hairline last:border-0">
                        <td className="p-3">
                          <Skeleton className="h-3 w-20" />
                        </td>
                        {selected.map((location) => (
                          <td key={location.id} className="p-3">
                            <Skeleton className="h-4 w-14" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr key={row.label} className="border-b border-hairline last:border-0">
                        <th scope="row" className="p-3 text-xs font-normal text-tertiary">
                          {row.label}
                        </th>
                        {row.cells.map((cell, index) => (
                          <td key={selected[index]?.id ?? index} className="p-3">
                            <span className="flex items-center gap-2">
                              {cell.glyph ? (
                                <WeatherGlyph
                                  glyph={cell.glyph}
                                  size={18}
                                  className="text-secondary"
                                />
                              ) : null}
                              <span
                                className={cn(
                                  "readout text-sm",
                                  cell.extreme === "high" && "font-semibold",
                                )}
                                style={cell.color ? { color: cell.color } : undefined}
                              >
                                {cell.value}
                              </span>
                              {/* A mark, not just weight, so the extreme
                                  survives greyscale. */}
                              {cell.extreme ? (
                                <span
                                  className="measured text-[10px] text-tertiary"
                                  aria-label={
                                    cell.extreme === "high" ? "highest" : "lowest"
                                  }
                                >
                                  {cell.extreme === "high" ? "▲" : "▼"}
                                </span>
                              ) : null}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {selected.length < MAX_COLUMNS ? (
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => setPicking((open) => !open)}>
            <Plus className="size-3.5" aria-hidden />
            Add a location
          </Button>

          {picking ? (
            <Panel className="p-3">
              <ul className="flex flex-wrap gap-2">
                {candidates.slice(0, 12).map((location) => (
                  <li key={location.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected((current) =>
                          current.length >= MAX_COLUMNS ? current : [...current, location],
                        );
                        setPicking(false);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs hover:border-strong"
                    >
                      <Check className="size-3 opacity-0" aria-hidden />
                      {location.name}
                    </button>
                  </li>
                ))}
              </ul>
              {candidates.length === 0 ? (
                <p className="text-xs text-tertiary">
                  Everything you have saved is already being compared. Press ⌘K to
                  find somewhere new.
                </p>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-tertiary">
          Five is the most that stays readable. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface Cell {
  value: string;
  /** Raw number used to find the extremes; undefined when unavailable. */
  sort?: number;
  extreme?: "high" | "low";
  color?: string;
  glyph?: string;
}

interface Row {
  label: string;
  cells: Cell[];
  /** Rows where every value is the same are not worth marking. */
  markExtremes: boolean;
}

function buildRows(
  locations: GeoLocation[],
  snapshots: Record<string, Snapshot>,
  units: ReturnType<typeof usePreferences.getState>["units"],
  hour12: boolean,
): Row[] {
  const read = (location: GeoLocation) => snapshots[key(location)];

  const row = (
    label: string,
    pick: (snapshot: Snapshot | undefined, location: GeoLocation) => Cell,
    markExtremes = true,
  ): Row => ({
    label,
    cells: locations.map((location) => pick(read(location), location)),
    markExtremes,
  });

  const rows: Row[] = [
    row("Conditions", (snapshot) => ({
      value: snapshot?.current.condition.label ?? "—",
      glyph: snapshot
        ? glyphFor(snapshot.current.condition, snapshot.current.isDay)
        : undefined,
    }), false),

    row("Temperature", (snapshot) =>
      snapshot
        ? {
            value: formatTemperature(snapshot.current.temperature, units.temperature)
              .display,
            sort: snapshot.current.temperature,
            color: temperatureColor(snapshot.current.temperature),
          }
        : { value: "—" },
    ),

    row("Feels like", (snapshot) =>
      snapshot
        ? {
            value: formatTemperature(snapshot.current.feelsLike, units.temperature)
              .display,
            sort: snapshot.current.feelsLike,
          }
        : { value: "—" },
    ),

    row("High / low", (snapshot) =>
      snapshot?.today
        ? {
            value: `${formatTemperature(snapshot.today.temperatureMax, units.temperature).display} / ${formatTemperature(snapshot.today.temperatureMin, units.temperature).display}`,
            sort: snapshot.today.temperatureMax,
          }
        : { value: "—" },
    ),

    row("Rain chance", (snapshot) =>
      snapshot?.today?.precipitationProbabilityMax !== undefined
        ? {
            value: formatPercent(snapshot.today.precipitationProbabilityMax).display,
            sort: snapshot.today.precipitationProbabilityMax,
          }
        : { value: "—" },
    ),

    row("Humidity", (snapshot) =>
      snapshot?.current.humidity !== undefined
        ? {
            value: formatPercent(snapshot.current.humidity).display,
            sort: snapshot.current.humidity,
          }
        : { value: "—" },
    ),

    row("Wind", (snapshot) =>
      snapshot
        ? {
            value: formatWind(snapshot.current.windSpeed, units.wind).display,
            sort: snapshot.current.windSpeed,
          }
        : { value: "—" },
    ),

    row("UV index", (snapshot) =>
      snapshot?.today?.uvIndexMax !== undefined
        ? {
            value: String(Math.round(snapshot.today.uvIndexMax)),
            sort: snapshot.today.uvIndexMax,
          }
        : { value: "—" },
    ),

    row("Sunrise", (snapshot, location) =>
      snapshot?.today?.sunrise
        ? {
            value: formatHour(snapshot.today.sunrise, location.timezone, { hour12 }),
          }
        : { value: "—" },
      false,
    ),

    row("Sunset", (snapshot, location) =>
      snapshot?.today?.sunset
        ? {
            value: formatHour(snapshot.today.sunset, location.timezone, { hour12 }),
          }
        : { value: "—" },
      false,
    ),
  ];

  for (const entry of rows) {
    if (!entry.markExtremes) continue;

    const numeric = entry.cells
      .map((cell) => cell.sort)
      .filter((value): value is number => value !== undefined);

    // Nothing to mark when there is one value, or when they all agree.
    if (numeric.length < 2) continue;
    const highest = Math.max(...numeric);
    const lowest = Math.min(...numeric);
    if (highest === lowest) continue;

    for (const cell of entry.cells) {
      if (cell.sort === highest) cell.extreme = "high";
      else if (cell.sort === lowest) cell.extreme = "low";
    }
  }

  return rows;
}
