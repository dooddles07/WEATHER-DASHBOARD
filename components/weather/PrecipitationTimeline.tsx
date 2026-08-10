"use client";

import { useMemo } from "react";

import { formatHour, relativeMinutes } from "@/lib/time";
import {
  PRECIPITATION_INTENSITY_LABEL,
  precipitationIntensity,
  rainColor,
  snowColor,
} from "@/lib/weather/scales";
import { isFrozen } from "@/lib/weather/wmo";
import type { HourPoint, PrecipitationNowcast } from "@/types/weather";

/**
 * When it starts, how hard, and when it stops.
 *
 * The nowcast answers the next two hours minute by minute where the provider
 * has radar-derived data; elsewhere it falls back to the hourly curve and says
 * so, because implying minute-level precision we do not have would be the
 * dishonest option.
 *
 * Bars are on a square-root scale so drizzle stays visible beside a downpour —
 * knowing that it is raining at all is the more common question.
 */

export function PrecipitationTimeline({
  nowcast,
  hours,
  timezone,
  hour12,
  now,
}: {
  nowcast?: PrecipitationNowcast;
  hours: HourPoint[];
  timezone: string;
  hour12: boolean;
  now: number;
}) {
  /** Falls back to the hourly series, resampled onto the same shape. */
  const series = useMemo(() => {
    if (nowcast && nowcast.steps.length > 0) {
      return {
        steps: nowcast.steps.map((step) => ({
          time: step.time,
          rate: step.ratePerHour,
          frozen: false,
        })),
        resolution: `${nowcast.resolutionMinutes}-minute`,
        highResolution: nowcast.highResolution,
        startsAt: nowcast.startsAt,
        endsAt: nowcast.endsAt,
        total: nowcast.totalMm,
      };
    }

    const upcoming = hours
      .filter((hour) => Date.parse(hour.time) >= now - 3600_000)
      .slice(0, 12);

    const firstWet = upcoming.find((hour) => (hour.precipitation ?? 0) > 0);
    const endsAt = firstWet
      ? upcoming.find(
          (hour) => hour.time > firstWet.time && (hour.precipitation ?? 0) === 0,
        )?.time
      : undefined;

    return {
      steps: upcoming.map((hour) => ({
        time: hour.time,
        rate: hour.precipitation ?? 0,
        frozen: isFrozen(hour.condition.kind),
      })),
      resolution: "hourly",
      highResolution: false,
      startsAt: firstWet?.time,
      endsAt,
      total: upcoming.reduce((sum, hour) => sum + (hour.precipitation ?? 0), 0),
    };
  }, [nowcast, hours, now]);

  const peak = Math.max(...series.steps.map((step) => step.rate), 0);
  const anyRain = peak > 0;

  const summary = anyRain
    ? series.startsAt && Date.parse(series.startsAt) > now
      ? `Rain expected ${relativeMinutes(series.startsAt, now)}`
      : series.endsAt
        ? `Rain easing ${relativeMinutes(series.endsAt, now)}`
        : "Rain in progress"
    : "No precipitation expected";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm">{summary}</p>
        {anyRain ? (
          <p className="measured text-xs text-tertiary">
            {series.total.toFixed(1)} mm total
          </p>
        ) : null}
      </div>

      {anyRain ? (
        <>
          <div
            className="flex h-20 items-end gap-px"
            role="img"
            aria-label={accessibleSummary(series.steps, timezone, hour12, peak)}
          >
            {series.steps.map((step) => {
              const height = peak === 0 ? 0 : Math.sqrt(step.rate / peak) * 100;
              return (
                <span
                  key={step.time}
                  className="flex-1 rounded-t-xs"
                  style={{
                    height: `${Math.max(step.rate > 0 ? 6 : 2, height)}%`,
                    backgroundColor:
                      step.rate > 0
                        ? step.frozen
                          ? snowColor(step.rate)
                          : rainColor(step.rate)
                        : "var(--surface-hover)",
                  }}
                />
              );
            })}
          </div>

          <div className="flex justify-between">
            {[0, Math.floor(series.steps.length / 2), series.steps.length - 1].map(
              (index) => {
                const step = series.steps[index];
                return step ? (
                  <span key={step.time} className="measured text-[10px] text-tertiary">
                    {index === 0
                      ? "Now"
                      : formatHour(step.time, timezone, { hour12 })}
                  </span>
                ) : null;
              },
            )}
          </div>

          <p className="text-xs text-tertiary">
            Peaks at{" "}
            <span className="text-secondary">
              {PRECIPITATION_INTENSITY_LABEL[precipitationIntensity(peak)].toLowerCase()}
            </span>
            {series.highResolution
              ? ", from radar-derived 15-minute data."
              : `, from the ${series.resolution} forecast. Minute-level radar data is not published for this location.`}
          </p>
        </>
      ) : (
        <p className="text-xs text-tertiary">
          Nothing in the next{" "}
          {series.steps.length >= 12 ? "12 hours" : "few hours"}.
        </p>
      )}
    </div>
  );
}

/**
 * Charts must be readable without seeing them. This states the shape of the
 * series rather than reading out every bar.
 */
function accessibleSummary(
  steps: Array<{ time: string; rate: number }>,
  timezone: string,
  hour12: boolean,
  peak: number,
): string {
  const wet = steps.filter((step) => step.rate > 0);
  if (wet.length === 0) return "No precipitation is forecast over this period.";

  const peakStep = steps.reduce(
    (worst, step) => (step.rate > worst.rate ? step : worst),
    steps[0],
  );

  return `Precipitation forecast: starts around ${formatHour(wet[0].time, timezone, { hour12 })}, peaking at ${peak.toFixed(1)} millimetres per hour around ${formatHour(peakStep.time, timezone, { hour12 })}, across ${wet.length} of ${steps.length} intervals.`;
}
