"use client";

import { area, curveMonotoneX, line } from "d3-shape";
import { useEffect, useMemo, useRef, useState } from "react";

import { Panel, SectionHeading } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/stores/preferences";
import { formatDayMonth } from "@/lib/time";
import { px } from "@/lib/utils/svg";
import { temperatureColor } from "@/lib/weather/scales";
import {
  formatPrecipitation,
  formatTemperature,
  formatTemperatureDelta,
} from "@/lib/weather/units";
import type { GeoLocation } from "@/types/location";
import type { ClimateNormal, HistoricalObservation } from "@/types/weather";

/**
 * The last three months, and how today sits against the long-term average.
 *
 * The anomaly is the headline because it is the only part that carries
 * judgement — "28 °C" means nothing without knowing that 24 °C is normal for
 * the month. The baseline and its sample size travel with the number, since an
 * anomaly against an unstated average is just a number with a plus sign.
 */

const HEIGHT = 220;
const PADDING = { top: 16, right: 8, bottom: 28, left: 40 };

export function HistoryView({
  location,
  observations,
  normal,
  todayMax,
  todayMin,
}: {
  location: GeoLocation;
  observations: HistoricalObservation[];
  normal?: ClimateNormal;
  todayMax?: number;
  todayMin?: number;
}) {
  const units = usePreferences((store) => store.units);

  const anomaly =
    normal && todayMax !== undefined ? todayMax - normal.temperatureMeanMax : undefined;

  const wettest = useMemo(
    () =>
      observations.reduce<HistoricalObservation | undefined>(
        (worst, entry) =>
          (entry.precipitationSum ?? 0) > (worst?.precipitationSum ?? -1) ? entry : worst,
        undefined,
      ),
    [observations],
  );

  const warmest = useMemo(
    () =>
      observations.reduce<HistoricalObservation | undefined>(
        (best, entry) =>
          (entry.temperatureMax ?? -999) > (best?.temperatureMax ?? -999) ? entry : best,
        undefined,
      ),
    [observations],
  );

  const totalRain = observations.reduce(
    (sum, entry) => sum + (entry.precipitationSum ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {normal && anomaly !== undefined && todayMax !== undefined ? (
        <Panel className="p-5">
          <SectionHeading title="Today against the average" className="mb-4" />

          <p className="text-base leading-relaxed">
            Today&rsquo;s high of{" "}
            <span className="readout">
              {formatTemperature(todayMax, units.temperature).display}
            </span>{" "}
            is{" "}
            {/* The magnitude is unsigned because the direction is spelled out
                immediately after it; "−0.5 °C below average" reads as a double
                negative and makes the reader stop and work it out. */}
            <span
              className="readout"
              style={{ color: temperatureColor(todayMax) }}
            >
              {formatTemperatureDelta(Math.abs(anomaly), units.temperature).display.replace(
                "+",
                "",
              )}
            </span>{" "}
            {Math.abs(anomaly) < 0.5
              ? "off the "
              : anomaly > 0
                ? "above the "
                : "below the "}
            {monthName(normal.month)} average for {location.name}.
          </p>

          <p className="mt-3 max-w-prose text-xs leading-relaxed text-tertiary">
            The baseline is the mean daily maximum for {monthName(normal.month)}
            {normal.sampleYears > 0
              ? `, averaged over ${normal.sampleYears} ${normal.sampleYears === 1 ? "year" : "years"} of ERA5 reanalysis`
              : ""}
            : <span className="measured">
              {formatTemperature(normal.temperatureMeanMax, units.temperature).display}
            </span>{" "}
            by day,{" "}
            <span className="measured">
              {formatTemperature(normal.temperatureMeanMin, units.temperature).display}
            </span>{" "}
            overnight.
            {todayMin !== undefined
              ? ` Tonight's low is forecast at ${formatTemperature(todayMin, units.temperature).display}.`
              : ""}
          </p>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <SectionHeading
          title="Last 90 days"
          detail={`${observations.length} days of records`}
          className="mb-4"
        />
        <HistoryChart observations={observations} timezone={location.timezone} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel className="flex flex-col gap-1.5 p-5">
          <p className="label-micro">Total rainfall</p>
          <p className="readout text-2xl">
            {formatPrecipitation(totalRain, units.precipitation).display}
          </p>
          <p className="text-xs text-tertiary">Across the whole period</p>
        </Panel>

        <Panel className="flex flex-col gap-1.5 p-5">
          <p className="label-micro">Warmest day</p>
          <p className="readout text-2xl">
            {warmest?.temperatureMax !== undefined
              ? formatTemperature(warmest.temperatureMax, units.temperature).display
              : "—"}
          </p>
          <p className="text-xs text-tertiary">
            {warmest ? formatDayMonth(`${warmest.date}T12:00:00Z`, "UTC") : "No data"}
          </p>
        </Panel>

        <Panel className="flex flex-col gap-1.5 p-5">
          <p className="label-micro">Wettest day</p>
          <p className="readout text-2xl">
            {wettest?.precipitationSum !== undefined
              ? formatPrecipitation(wettest.precipitationSum, units.precipitation).display
              : "—"}
          </p>
          <p className="text-xs text-tertiary">
            {wettest ? formatDayMonth(`${wettest.date}T12:00:00Z`, "UTC") : "No data"}
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Daily maximum and minimum as a filled band, with rainfall as bars beneath.
 * The band is the useful shape — a single mean line hides the fact that a day
 * swung twenty degrees.
 */
function HistoryChart({
  observations,
  timezone,
}: {
  observations: HistoricalObservation[];
  timezone: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const units = usePreferences((store) => store.units);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const usable = useMemo(
    () =>
      observations.filter(
        (entry) =>
          entry.temperatureMax !== undefined && entry.temperatureMin !== undefined,
      ),
    [observations],
  );

  const plot = useMemo(() => {
    if (usable.length < 2 || width === 0) return undefined;

    const maxima = usable.map((entry) => entry.temperatureMax!);
    const minima = usable.map((entry) => entry.temperatureMin!);
    const top = Math.max(...maxima) + 2;
    const bottom = Math.min(...minima) - 2;

    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (index: number) =>
      PADDING.left + (index / Math.max(1, usable.length - 1)) * innerWidth;
    const y = (value: number) =>
      PADDING.top + innerHeight - ((value - bottom) / (top - bottom)) * innerHeight;

    const band = area<HistoricalObservation>()
      .x((_, index) => px(x(index)))
      .y0((entry) => px(y(entry.temperatureMin!)))
      .y1((entry) => px(y(entry.temperatureMax!)))
      .curve(curveMonotoneX);

    const mean = line<HistoricalObservation>()
      .x((_, index) => px(x(index)))
      .y((entry) =>
        px(y(entry.temperatureMean ?? (entry.temperatureMax! + entry.temperatureMin!) / 2)),
      )
      .curve(curveMonotoneX);

    const peakRain = Math.max(
      ...usable.map((entry) => entry.precipitationSum ?? 0),
      0.1,
    );

    return {
      usable,
      x,
      y,
      top,
      bottom,
      innerHeight,
      band: band(usable) ?? "",
      mean: mean(usable) ?? "",
      peakRain,
    };
  }, [usable, width]);

  const summary = plot
    ? `Daily temperature over ${plot.usable.length} days, ranging from ${formatTemperature(plot.bottom + 2, units.temperature).spoken} to ${formatTemperature(plot.top - 2, units.temperature).spoken}.`
    : "Historical temperature data is unavailable.";

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} role="img" aria-label={summary} style={{ height: HEIGHT }}>
        {plot && width > 0 ? (
          <svg width={width} height={HEIGHT} aria-hidden className="block">
            <defs>
              <linearGradient
                id="history-band"
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={plot.y(plot.bottom)}
                x2={0}
                y2={plot.y(plot.top)}
              >
                {Array.from({ length: 8 }, (_, index) => {
                  const t = index / 7;
                  return (
                    <stop
                      key={index}
                      offset={`${t * 100}%`}
                      stopColor={temperatureColor(
                        plot.bottom + (plot.top - plot.bottom) * t,
                      )}
                    />
                  );
                })}
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const value = plot.bottom + (plot.top - plot.bottom) * fraction;
              return (
                <g key={fraction}>
                  <line
                    x1={PADDING.left}
                    x2={width - PADDING.right}
                    y1={px(plot.y(value))}
                    y2={px(plot.y(value))}
                    stroke="var(--line-hairline)"
                  />
                  <text
                    x={PADDING.left - 6}
                    y={px(plot.y(value)) + 3}
                    textAnchor="end"
                    fontSize={9}
                    className="measured"
                    fill="var(--text-tertiary)"
                  >
                    {formatTemperature(value, units.temperature).display}
                  </text>
                </g>
              );
            })}

            {/* Rainfall beneath, on its own scale — the shape matters, the
                absolute height does not, and the cards below carry the totals. */}
            {plot.usable.map((entry, index) => {
              const rain = entry.precipitationSum ?? 0;
              if (rain <= 0) return null;
              const height = (rain / plot.peakRain) * (plot.innerHeight * 0.28);
              return (
                <rect
                  key={entry.date}
                  x={px(plot.x(index) - 1)}
                  y={px(HEIGHT - PADDING.bottom - height)}
                  width={2}
                  height={px(height)}
                  fill="var(--text-tertiary)"
                  opacity={0.45}
                />
              );
            })}

            <path d={plot.band} fill="url(#history-band)" opacity={0.22} />
            <path
              d={plot.mean}
              fill="none"
              stroke="url(#history-band)"
              strokeWidth={1.5}
            />

            {[0, Math.floor(plot.usable.length / 2), plot.usable.length - 1].map(
              (index) => (
                <text
                  key={index}
                  x={px(plot.x(index))}
                  y={HEIGHT - 8}
                  textAnchor={index === 0 ? "start" : index === plot.usable.length - 1 ? "end" : "middle"}
                  fontSize={9}
                  className="measured"
                  fill="var(--text-tertiary)"
                >
                  {formatDayMonth(`${plot.usable[index].date}T12:00:00Z`, "UTC")}
                </text>
              ),
            )}
          </svg>
        ) : usable.length < 2 ? (
          <p className="text-sm text-tertiary">
            Not enough historical data to chart for this location.
          </p>
        ) : (
          // The chart needs its measured width before it can be drawn. Saying
          // "no data" here would be a lie — the records are in the table below.
          <div
            className="h-full w-full animate-pulse rounded-md bg-[--surface-hover] motion-reduce:animate-none"
            aria-hidden
          />
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-tertiary hover:text-secondary">
          View as a table
        </summary>
        <div className="scroll-region mt-2 max-h-64 overflow-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-hairline">
                <th scope="col" className="label-micro p-2">Date</th>
                <th scope="col" className="label-micro p-2">High</th>
                <th scope="col" className="label-micro p-2">Low</th>
                <th scope="col" className="label-micro p-2">Rain</th>
              </tr>
            </thead>
            <tbody>
              {[...observations].reverse().map((entry) => (
                <tr key={entry.date} className="border-b border-hairline last:border-0">
                  <th scope="row" className="measured p-2 font-normal text-tertiary">
                    {formatDayMonth(`${entry.date}T12:00:00Z`, "UTC")}
                  </th>
                  <td className="measured p-2">
                    {entry.temperatureMax !== undefined
                      ? formatTemperature(entry.temperatureMax, units.temperature).display
                      : "—"}
                  </td>
                  <td className="measured p-2">
                    {entry.temperatureMin !== undefined
                      ? formatTemperature(entry.temperatureMin, units.temperature).display
                      : "—"}
                  </td>
                  <td className="measured p-2">
                    {entry.precipitationSum !== undefined
                      ? formatPrecipitation(entry.precipitationSum, units.precipitation)
                          .display
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-[11px] text-tertiary">
        Times and dates are in {timezone.replace("_", " ")}. Source: ERA5
        reanalysis via Open-Meteo.
      </p>
    </div>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthName = (month: number) => MONTHS[month - 1] ?? "";
