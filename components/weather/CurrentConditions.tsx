"use client";

import { Label } from "@/components/ui/primitives";
import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { describeLocation } from "@/lib/locations/places";
import { formatHour, formatZoneOffset, freshness } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import {
  formatPercent,
  formatTemperature,
  formatWind,
  type UnitPreferences,
} from "@/lib/weather/units";
import { compassPoint } from "@/lib/weather/units";
import { glyphFor } from "@/lib/weather/wmo";
import type { GeoLocation } from "@/types/location";
import type { DayPoint, HourPoint } from "@/types/weather";

/**
 * The hero.
 *
 * A temperature on its own is not an answer to anything, so the reading is
 * never alone: what it feels like, where it sits between today's high and low,
 * and what the sky is doing all appear together. The large number is set in the
 * expanded gauge face — this is the one place in the product where a number is
 * allowed to be this big, and it earns it.
 *
 * When the timeline is scrubbed this describes the scrubbed moment, and says so
 * rather than continuing to imply it is current.
 */

export function CurrentConditions({
  hour,
  today,
  location,
  units,
  hour12,
  fetchedAt,
  now,
  scrubbed,
}: {
  hour: HourPoint;
  today?: DayPoint;
  location: GeoLocation;
  units: UnitPreferences;
  hour12: boolean;
  fetchedAt: string;
  now: number;
  scrubbed: boolean;
}) {
  const temperature = formatTemperature(hour.temperature, units.temperature);
  const feelsLike = formatTemperature(hour.feelsLike, units.temperature);
  const wind = formatWind(hour.windSpeed, units.wind);
  const age = freshness(fetchedAt, now || Date.now());

  const gap = Math.abs(hour.feelsLike - hour.temperature);

  return (
    <section aria-labelledby="current-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 id="current-heading" className="text-lg font-semibold tracking-tight">
          {location.name}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
          <span>{describeLocation(location)}</span>
          <span aria-hidden>·</span>
          <span className="measured">{formatZoneOffset(location.timezone)}</span>
        </p>
      </div>

      <div className="flex items-start gap-5">
        <div className="flex flex-col">
          <p className="flex items-start">
            <span
              className="readout readout-lg text-[clamp(3.5rem,10vw,5.5rem)] leading-[0.88]"
              aria-label={temperature.spoken}
            >
              {temperature.display}
            </span>
          </p>

          <p className="mt-2 text-sm text-secondary">
            {hour.condition.label}
            {gap >= 1 ? (
              <>
                {" · "}
                <span className="text-tertiary">Feels like {feelsLike.display}</span>
              </>
            ) : null}
          </p>
        </div>

        <WeatherGlyph
          glyph={glyphFor(hour.condition, hour.isDay)}
          size={64}
          className="mt-1 text-secondary"
        />
      </div>

      {/* The day's envelope, so the current reading has somewhere to sit. */}
      {today ? (
        <TemperatureRange
          low={today.temperatureMin}
          high={today.temperatureMax}
          current={hour.temperature}
          units={units}
        />
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Reading label="Wind" value={wind.display}>
          {compassPoint(hour.windDirection)}
          {hour.windGust && hour.windGust > hour.windSpeed
            ? ` · gusts ${formatWind(hour.windGust, units.wind).display}`
            : ""}
        </Reading>

        {hour.humidity !== undefined ? (
          <Reading label="Humidity" value={formatPercent(hour.humidity).display}>
            {hour.dewPoint !== undefined
              ? `Dew point ${formatTemperature(hour.dewPoint, units.temperature).display}`
              : undefined}
          </Reading>
        ) : null}

        {hour.precipitationProbability !== undefined ? (
          <Reading
            label="Rain chance"
            value={formatPercent(hour.precipitationProbability).display}
          >
            {hour.precipitation && hour.precipitation > 0
              ? `${hour.precipitation.toFixed(1)} mm this hour`
              : "None expected"}
          </Reading>
        ) : null}

        {hour.cloudCover !== undefined ? (
          <Reading label="Cloud" value={formatPercent(hour.cloudCover).display} />
        ) : null}
      </dl>

      <p
        className={cn(
          "text-xs",
          age.stale && !scrubbed ? "text-secondary" : "text-tertiary",
        )}
      >
        {scrubbed ? (
          <>
            Showing the forecast for{" "}
            <span className="measured">
              {formatHour(hour.time, location.timezone, { hour12 })}
            </span>
          </>
        ) : age.stale ? (
          <>Weather data may be outdated. {age.label}.</>
        ) : (
          age.label
        )}
      </p>
    </section>
  );
}

function Reading({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className="flex flex-col gap-0.5">
        <span className="readout text-lg">{value}</span>
        {children ? (
          <span className="truncate text-xs text-tertiary">{children}</span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Today's low to high with the current reading marked. A bare pair of numbers
 * does not say whether 24° is the cool part of a hot day or the warm part of a
 * cold one; the position on the bar does.
 */
function TemperatureRange({
  low,
  high,
  current,
  units,
}: {
  low: number;
  high: number;
  current: number;
  units: UnitPreferences;
}) {
  const span = Math.max(0.1, high - low);
  const position = Math.min(100, Math.max(0, ((current - low) / span) * 100));

  return (
    <div className="flex items-center gap-3">
      <span className="readout text-sm text-tertiary">
        {formatTemperature(low, units.temperature).display}
      </span>

      <div
        className="relative h-1 flex-1 rounded-full bg-[--surface-hover]"
        role="img"
        aria-label={`Today ranges from ${formatTemperature(low, units.temperature).spoken} to ${formatTemperature(high, units.temperature).spoken}. Currently ${formatTemperature(current, units.temperature).spoken}.`}
      >
        <span
          aria-hidden
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-primary"
          style={{ left: `${position}%` }}
        />
      </div>

      <span className="readout text-sm">
        {formatTemperature(high, units.temperature).display}
      </span>
    </div>
  );
}
