"use client";

import { useMemo, useState } from "react";

import { Panel, SectionHeading } from "@/components/ui/primitives";
import { DailyStrip } from "@/components/weather/DailyStrip";
import {
  HourlyChart,
  METRIC_LABELS,
  type HourlyMetric,
} from "@/components/weather/HourlyChart";
import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { usePreferences } from "@/lib/stores/preferences";
import { formatHour } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import type { DayPartSummary } from "@/lib/weather/insights";
import { formatTemperature } from "@/lib/weather/units";
import { glyphFor } from "@/lib/weather/wmo";
import type { ForecastConfidence, WeatherBundle } from "@/types/weather";

/**
 * Forecast detail.
 *
 * Three levels of zoom on the same data: the next hours as a scrollable strip,
 * the next two days as a chart you can switch between metrics, and the
 * fortnight as expandable rows. Model agreement sits at the top because it
 * qualifies everything below it.
 */

const METRICS: HourlyMetric[] = [
  "temperature",
  "precipitation",
  "wind",
  "uv",
  "humidity",
];

export function ForecastView({
  bundle,
  confidence,
  dayParts,
  serverNow,
}: {
  bundle: WeatherBundle;
  confidence?: ForecastConfidence;
  dayParts: DayPartSummary[];
  serverNow: number;
}) {
  const units = usePreferences((store) => store.units);
  const hour12 = usePreferences((store) => store.hour12);
  const [metric, setMetric] = useState<HourlyMetric>("temperature");

  const upcoming = useMemo(
    () =>
      bundle.hourly
        .filter((hour) => Date.parse(hour.time) >= serverNow - 3600_000)
        .slice(0, 48),
    [bundle.hourly, serverNow],
  );

  return (
    <div className="flex flex-col gap-4">
      {dayParts.length > 0 ? (
        <Panel className="p-5">
          <SectionHeading title="Today, in parts" className="mb-4" />
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dayParts.map((part) => (
              <div
                key={part.part}
                className="flex flex-col gap-1.5 border-l-2 border-hairline pl-3"
              >
                <dt className="label-micro">{part.part}</dt>
                <dd className="flex flex-col gap-1">
                  <span className="readout text-lg">
                    {formatTemperature(part.temperature, units.temperature).display}
                  </span>
                  <span className="text-xs leading-relaxed text-tertiary">
                    {part.summary}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Next 48 hours" />

          <div
            role="radiogroup"
            aria-label="Chart metric"
            className="flex flex-wrap gap-0.5 rounded-md border border-hairline p-0.5"
          >
            {METRICS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={metric === option}
                onClick={() => setMetric(option)}
                className={cn(
                  "cursor-pointer rounded-sm px-2.5 py-1.5 text-xs transition-colors duration-[--duration-fast]",
                  metric === option
                    ? "bg-primary text-inverse"
                    : "text-tertiary hover:bg-[--surface-hover] hover:text-primary",
                )}
              >
                {METRIC_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <HourlyChart
          hours={upcoming}
          metric={metric}
          timezone={bundle.location.timezone}
          units={units}
          hour12={hour12}
          now={serverNow}
        />
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Hour by hour"
          detail="Scroll for more"
          className="mb-3"
        />
        <ul className="scroll-region -mx-1 flex gap-1 overflow-x-auto pb-2">
          {upcoming.map((hour) => (
            <li
              key={hour.time}
              className="flex w-16 shrink-0 flex-col items-center gap-2 rounded-md px-1 py-2.5"
            >
              <span className="measured text-[10px] text-tertiary">
                {formatHour(hour.time, bundle.location.timezone, { hour12 })}
              </span>
              <WeatherGlyph
                glyph={glyphFor(hour.condition, hour.isDay)}
                size={22}
                className="text-secondary"
              />
              <span className="readout text-sm">
                {formatTemperature(hour.temperature, units.temperature).display}
              </span>
              <span
                className={cn(
                  "measured text-[10px]",
                  (hour.precipitationProbability ?? 0) >= 40
                    ? "text-secondary"
                    : "text-tertiary opacity-0",
                )}
              >
                {Math.round(hour.precipitationProbability ?? 0)}%
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-5">
        <SectionHeading title="Next 14 days" className="mb-3" />
        <DailyStrip
          days={bundle.daily}
          location={bundle.location}
          units={units}
          today={serverNow}
        />
      </Panel>

      {confidence ? (
        <Panel surface="sunken" className="p-5">
          <SectionHeading title="Forecast confidence" className="mb-3" />
          <p className="text-sm">
            <span className="font-medium capitalize">{confidence.level}</span>{" "}
            agreement between {confidence.models.length} independent models.
          </p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-tertiary">
            Across the coming week the models differ by up to{" "}
            <span className="measured">
              {confidence.temperatureSpread.toFixed(1)} °C
            </span>{" "}
            on daily maximum temperature and{" "}
            <span className="measured">
              {confidence.precipitationSpread.toFixed(1)} mm
            </span>{" "}
            on rainfall. Wider spread means the atmosphere is harder to predict
            right now, not that the forecast is wrong.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
