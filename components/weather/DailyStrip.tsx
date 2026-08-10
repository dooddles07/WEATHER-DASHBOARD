"use client";

import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { formatDayMonth, formatWeekdayShort, localDateKey } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import { temperatureColor } from "@/lib/weather/scales";
import {
  formatPercent,
  formatTemperature,
  formatWind,
  type UnitPreferences,
} from "@/lib/weather/units";
import { glyphFor } from "@/lib/weather/wmo";
import type { GeoLocation } from "@/types/location";
import type { DayPoint } from "@/types/weather";

/**
 * The fortnight ahead.
 *
 * Each day's range is drawn on a shared scale, so the bars line up across rows
 * and a cold snap on Thursday is visible as a shape rather than something you
 * have to work out by comparing fourteen pairs of numbers. The bar is tinted by
 * the temperature scale at each end, which is the same mapping the ribbon and
 * the map use.
 */

export function DailyStrip({
  days,
  location,
  units,
  today,
}: {
  days: DayPoint[];
  location: GeoLocation;
  units: UnitPreferences;
  /** Milliseconds, used only to mark which row is today. */
  today: number;
}) {
  const todayKey = today ? localDateKey(today, location.timezone) : undefined;

  // The provider is asked for one past day so the ribbon has history behind
  // "now". A forecast list should not lead with yesterday, so it is dropped
  // here rather than at the fetch, where the ribbon still needs it.
  const forecast = todayKey ? days.filter((day) => day.date >= todayKey) : days;

  if (forecast.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        The daily forecast is unavailable for this location.
      </p>
    );
  }

  const lows = forecast.map((day) => day.temperatureMin);
  const highs = forecast.map((day) => day.temperatureMax);
  const floor = Math.min(...lows);
  const ceiling = Math.max(...highs);
  const span = Math.max(1, ceiling - floor);

  return (
    <div>
      <ul className="flex flex-col">
        {forecast.map((day) => {
          const isToday = day.date === todayKey;
          const left = ((day.temperatureMin - floor) / span) * 100;
          const width = ((day.temperatureMax - day.temperatureMin) / span) * 100;
          const rain = day.precipitationProbabilityMax ?? 0;

          return (
            <li key={day.date}>
              <details className="group border-t border-hairline first:border-t-0">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-3 py-2.5 transition-colors hover:bg-[--surface-hover]",
                    isToday && "font-medium",
                  )}
                >
                  <span className="w-11 shrink-0 text-xs">
                    {isToday ? "Today" : formatWeekdayShort(`${day.date}T12:00:00Z`, "UTC")}
                  </span>

                  <WeatherGlyph
                    glyph={glyphFor(day.condition, true)}
                    size={20}
                    className="shrink-0 text-secondary"
                  />

                  <span className="hidden w-10 shrink-0 text-xs text-tertiary sm:block">
                    {rain >= 20 ? formatPercent(rain).display : ""}
                  </span>

                  <span className="readout w-9 shrink-0 text-right text-sm text-tertiary">
                    {formatTemperature(day.temperatureMin, units.temperature).display}
                  </span>

                  <span
                    className="relative h-1.5 min-w-0 flex-1 rounded-full bg-[--surface-hover]"
                    role="img"
                    aria-label={`${formatTemperature(day.temperatureMin, units.temperature).spoken} to ${formatTemperature(day.temperatureMax, units.temperature).spoken}`}
                  >
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 3)}%`,
                        background: `linear-gradient(90deg, ${temperatureColor(day.temperatureMin)}, ${temperatureColor(day.temperatureMax)})`,
                      }}
                    />
                  </span>

                  <span className="readout w-9 shrink-0 text-sm">
                    {formatTemperature(day.temperatureMax, units.temperature).display}
                  </span>
                </summary>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-hairline bg-sunken px-3 py-3 sm:grid-cols-4">
                  <Detail
                    label="Date"
                    value={formatDayMonth(`${day.date}T12:00:00Z`, "UTC")}
                  />
                  <Detail
                    label="Rain chance"
                    value={
                      day.precipitationProbabilityMax !== undefined
                        ? formatPercent(day.precipitationProbabilityMax).display
                        : "—"
                    }
                  />
                  <Detail
                    label="Rainfall"
                    value={
                      day.precipitationSum !== undefined
                        ? `${day.precipitationSum.toFixed(1)} mm`
                        : "—"
                    }
                  />
                  <Detail
                    label="Wind"
                    value={
                      day.windSpeedMax !== undefined
                        ? formatWind(day.windSpeedMax, units.wind).display
                        : "—"
                    }
                  />
                  <Detail
                    label="Gusts"
                    value={
                      day.windGustMax !== undefined
                        ? formatWind(day.windGustMax, units.wind).display
                        : "—"
                    }
                  />
                  <Detail
                    label="UV index"
                    value={
                      day.uvIndexMax !== undefined
                        ? String(Math.round(day.uvIndexMax))
                        : "—"
                    }
                  />
                  <Detail
                    label="Feels like"
                    value={
                      day.feelsLikeMax !== undefined && day.feelsLikeMin !== undefined
                        ? `${formatTemperature(day.feelsLikeMin, units.temperature).display} to ${formatTemperature(day.feelsLikeMax, units.temperature).display}`
                        : "—"
                    }
                  />
                  <Detail label="Conditions" value={day.condition.label} />
                </dl>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-micro">{label}</dt>
      <dd className="measured text-xs">{value}</dd>
    </div>
  );
}
