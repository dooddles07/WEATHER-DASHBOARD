"use client";

import { area, curveMonotoneX, line } from "d3-shape";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WeatherGlyph } from "@/components/weather/WeatherGlyph";
import { formatHour, formatWeekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import { rainColor, temperatureColor } from "@/lib/weather/scales";
import {
  formatPercent,
  formatTemperature,
  formatWind,
  type UnitPreferences,
} from "@/lib/weather/units";
import { glyphFor } from "@/lib/weather/wmo";
import type { HourPoint } from "@/types/weather";

/**
 * The hourly chart.
 *
 * Built by hand rather than with a charting library, for two reasons. The
 * meteorological look — a temperature line tinted by its own value, rain drawn
 * as accumulation bars beneath a probability curve, a sunrise notch — is not
 * something a general-purpose library expresses without fighting it. And every
 * chart in this product needs an accessible equivalent, which is far easier to
 * guarantee when we own the markup.
 *
 * The curve is monotone, never a natural spline: a cubic through hourly points
 * overshoots at a cold front and draws a temperature that was never forecast.
 */

export type HourlyMetric =
  | "temperature"
  | "precipitation"
  | "wind"
  | "uv"
  | "humidity";

export const METRIC_LABELS: Record<HourlyMetric, string> = {
  temperature: "Temperature",
  precipitation: "Rain",
  wind: "Wind",
  uv: "UV",
  humidity: "Humidity",
};

interface MetricConfig {
  /** Primary series. */
  value: (hour: HourPoint) => number | undefined;
  /** Optional companion series, drawn dashed. */
  secondary?: (hour: HourPoint) => number | undefined;
  secondaryLabel?: string;
  /** Bars beneath the line, used for accumulation. */
  bars?: (hour: HourPoint) => number | undefined;
  format: (value: number, units: UnitPreferences) => string;
  /** Colour for a value, so the line carries meaning as well as shape. */
  color?: (value: number) => string;
  /** Forces the axis to include these, e.g. 0–100 for a percentage. */
  domain?: [number, number];
}

const CONFIGS: Record<HourlyMetric, MetricConfig> = {
  temperature: {
    value: (hour) => hour.temperature,
    secondary: (hour) => hour.feelsLike,
    secondaryLabel: "Feels like",
    format: (value, units) => formatTemperature(value, units.temperature).display,
    color: temperatureColor,
  },
  precipitation: {
    value: (hour) => hour.precipitationProbability ?? 0,
    bars: (hour) => hour.precipitation ?? 0,
    format: (value) => formatPercent(value).display,
    domain: [0, 100],
  },
  wind: {
    value: (hour) => hour.windSpeed,
    secondary: (hour) => hour.windGust,
    secondaryLabel: "Gusts",
    format: (value, units) => formatWind(value, units.wind).display,
  },
  uv: {
    value: (hour) => hour.uvIndex ?? 0,
    format: (value) => String(Math.round(value)),
    domain: [0, 12],
  },
  humidity: {
    value: (hour) => hour.humidity ?? 0,
    secondary: (hour) => hour.dewPoint,
    secondaryLabel: "Dew point",
    format: (value) => formatPercent(value).display,
    domain: [0, 100],
  },
};

const HEIGHT = 220;
const PADDING = { top: 26, right: 8, bottom: 40, left: 38 };

export function HourlyChart({
  hours,
  metric,
  timezone,
  units,
  hour12,
  now,
}: {
  hours: HourPoint[];
  metric: HourlyMetric;
  timezone: string;
  units: UnitPreferences;
  hour12: boolean;
  now: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | undefined>();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const config = CONFIGS[metric];

  const plot = useMemo(() => {
    if (hours.length === 0 || width === 0) return undefined;

    const values = hours
      .map((hour) => config.value(hour))
      .filter((value): value is number => value !== undefined);
    const secondaries = config.secondary
      ? hours
          .map((hour) => config.secondary!(hour))
          .filter((value): value is number => value !== undefined)
      : [];

    const all = [...values, ...secondaries];
    if (all.length === 0) return undefined;

    const rawMin = config.domain?.[0] ?? Math.min(...all);
    const rawMax = config.domain?.[1] ?? Math.max(...all);
    const pad = config.domain ? 0 : Math.max(1, (rawMax - rawMin) * 0.15);

    const min = rawMin - pad;
    const max = rawMax + pad;

    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (index: number) =>
      PADDING.left + (index / Math.max(1, hours.length - 1)) * innerWidth;
    const y = (value: number) =>
      PADDING.top + innerHeight - ((value - min) / Math.max(0.001, max - min)) * innerHeight;

    return { x, y, min, max, innerWidth, innerHeight };
  }, [hours, width, config]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!plot || hours.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio =
        (event.clientX - rect.left - PADDING.left) / Math.max(1, plot.innerWidth);
      setCursor(
        Math.min(hours.length - 1, Math.max(0, Math.round(ratio * (hours.length - 1)))),
      );
    },
    [plot, hours.length],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (hours.length === 0) return;
      const current = cursor ?? 0;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCursor(Math.max(0, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCursor(Math.min(hours.length - 1, current + 1));
      } else if (event.key === "Escape") {
        setCursor(undefined);
      }
    },
    [cursor, hours.length],
  );

  const summary = useMemo(
    () => describeSeries(hours, metric, config, units, timezone, hour12),
    [hours, metric, config, units, timezone, hour12],
  );

  const active = cursor !== undefined ? hours[cursor] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        tabIndex={0}
        role="img"
        aria-label={summary}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setCursor(undefined)}
        onKeyDown={onKeyDown}
        className="relative w-full cursor-crosshair rounded-md"
        style={{ height: HEIGHT }}
      >
        {plot && width > 0 ? (
          <svg width={width} height={HEIGHT} aria-hidden className="block">
            <Gridlines plot={plot} width={width} config={config} units={units} />

            {config.bars ? (
              <Bars hours={hours} plot={plot} accessor={config.bars} />
            ) : null}

            <Series hours={hours} plot={plot} config={config} />

            <DayMarkers
              hours={hours}
              plot={plot}
              timezone={timezone}
              hour12={hour12}
              now={now}
            />

            {cursor !== undefined ? (
              <g>
                <line
                  x1={plot.x(cursor)}
                  x2={plot.x(cursor)}
                  y1={PADDING.top - 6}
                  y2={HEIGHT - PADDING.bottom}
                  stroke="var(--playhead)"
                  strokeWidth={1}
                />
                {(() => {
                  const value = config.value(hours[cursor]);
                  return value === undefined ? null : (
                    <circle
                      cx={plot.x(cursor)}
                      cy={plot.y(value)}
                      r={4}
                      fill="var(--surface-panel)"
                      stroke="var(--playhead)"
                      strokeWidth={2}
                    />
                  );
                })()}
              </g>
            ) : null}
          </svg>
        ) : (
          <div className="size-full animate-pulse rounded-md bg-[--surface-hover] motion-reduce:animate-none" />
        )}

        {active && plot ? (
          <Tooltip
            hour={active}
            units={units}
            timezone={timezone}
            hour12={hour12}
            x={plot.x(cursor!)}
            width={width}
          />
        ) : null}
      </div>

      {/* The chart's data, for anyone who cannot use the chart. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-tertiary hover:text-secondary">
          View as a table
        </summary>
        <div className="scroll-region mt-2 max-h-64 overflow-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-hairline">
                <th scope="col" className="label-micro p-2">
                  Time
                </th>
                <th scope="col" className="label-micro p-2">
                  {METRIC_LABELS[metric]}
                </th>
                <th scope="col" className="label-micro p-2">
                  Conditions
                </th>
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => {
                const value = config.value(hour);
                return (
                  <tr key={hour.time} className="border-b border-hairline last:border-0">
                    <th scope="row" className="measured p-2 font-normal text-tertiary">
                      {formatWeekdayShort(hour.time, timezone)}{" "}
                      {formatHour(hour.time, timezone, { hour12 })}
                    </th>
                    <td className="measured p-2">
                      {value === undefined ? "—" : config.format(value, units)}
                    </td>
                    <td className="p-2 text-tertiary">{hour.condition.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface Plot {
  x: (index: number) => number;
  y: (value: number) => number;
  min: number;
  max: number;
  innerWidth: number;
  innerHeight: number;
}

function Gridlines({
  plot,
  width,
  config,
  units,
}: {
  plot: Plot;
  width: number;
  config: MetricConfig;
  units: UnitPreferences;
}) {
  const steps = 4;
  return (
    <g>
      {Array.from({ length: steps + 1 }, (_, index) => {
        const value = plot.min + ((plot.max - plot.min) * index) / steps;
        const y = plot.y(value);
        return (
          <g key={index}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--line-hairline)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              className="measured"
              fill="var(--text-tertiary)"
            >
              {config.format(value, units)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Bars({
  hours,
  plot,
  accessor,
}: {
  hours: HourPoint[];
  plot: Plot;
  accessor: (hour: HourPoint) => number | undefined;
}) {
  const values = hours.map((hour) => accessor(hour) ?? 0);
  const peak = Math.max(...values, 0.1);
  const barWidth = Math.max(2, (plot.innerWidth / hours.length) * 0.6);

  return (
    <g>
      {hours.map((hour, index) => {
        const amount = values[index];
        if (amount <= 0) return null;
        // Square root, so a light shower is still visible beside a downpour.
        const height = Math.sqrt(amount / peak) * (plot.innerHeight * 0.42);
        return (
          <rect
            key={hour.time}
            x={plot.x(index) - barWidth / 2}
            y={PADDING.top + plot.innerHeight - height}
            width={barWidth}
            height={height}
            rx={1}
            fill={rainColor(amount)}
            opacity={0.7}
          />
        );
      })}
    </g>
  );
}

function Series({
  hours,
  plot,
  config,
}: {
  hours: HourPoint[];
  plot: Plot;
  config: MetricConfig;
}) {
  const gradientId = "hourly-series";

  const primary = useMemo(() => {
    const points = hours
      .map((hour, index) => ({ index, value: config.value(hour) }))
      .filter((point): point is { index: number; value: number } => point.value !== undefined);

    const shape = line<{ index: number; value: number }>()
      .x((point) => plot.x(point.index))
      .y((point) => plot.y(point.value))
      .curve(curveMonotoneX);

    const fill = area<{ index: number; value: number }>()
      .x((point) => plot.x(point.index))
      .y0(PADDING.top + plot.innerHeight)
      .y1((point) => plot.y(point.value))
      .curve(curveMonotoneX);

    return { stroke: shape(points) ?? "", fill: fill(points) ?? "" };
  }, [hours, plot, config]);

  const secondary = useMemo(() => {
    if (!config.secondary) return undefined;
    const points = hours
      .map((hour, index) => ({ index, value: config.secondary!(hour) }))
      .filter((point): point is { index: number; value: number } => point.value !== undefined);

    return (
      line<{ index: number; value: number }>()
        .x((point) => plot.x(point.index))
        .y((point) => plot.y(point.value))
        .curve(curveMonotoneX)(points) ?? ""
    );
  }, [hours, plot, config]);

  const stroke = config.color ? `url(#${gradientId})` : "var(--text-primary)";

  return (
    <g>
      {config.color ? (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={plot.y(plot.min)}
            x2={0}
            y2={plot.y(plot.max)}
          >
            {Array.from({ length: 8 }, (_, index) => {
              const t = index / 7;
              return (
                <stop
                  key={index}
                  offset={`${t * 100}%`}
                  stopColor={config.color!(plot.min + (plot.max - plot.min) * t)}
                />
              );
            })}
          </linearGradient>
        </defs>
      ) : null}

      <path d={primary.fill} fill={stroke} opacity={0.1} />

      {secondary ? (
        <path
          d={secondary}
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
        />
      ) : null}

      <path
        d={primary.stroke}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Midnight boundaries, the current time, and sunrise or sunset transitions. */
function DayMarkers({
  hours,
  plot,
  timezone,
  hour12,
  now,
}: {
  hours: HourPoint[];
  plot: Plot;
  timezone: string;
  hour12: boolean;
  now: number;
}) {
  const nowIndex = hours.findIndex((hour) => Date.parse(hour.time) >= now);

  return (
    <g>
      {hours.map((hour, index) => {
        const label = formatHour(hour.time, timezone, { hour12: false });
        const midnight = label.startsWith("00");
        const transition = index > 0 && hours[index - 1].isDay !== hour.isDay;

        if (!midnight && !transition && index % 6 !== 0) return null;

        return (
          <g key={hour.time}>
            {midnight ? (
              <line
                x1={plot.x(index)}
                x2={plot.x(index)}
                y1={PADDING.top - 6}
                y2={HEIGHT - PADDING.bottom}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
            ) : null}

            {transition ? (
              <line
                x1={plot.x(index)}
                x2={plot.x(index)}
                y1={HEIGHT - PADDING.bottom}
                y2={HEIGHT - PADDING.bottom + 4}
                stroke="var(--text-tertiary)"
                strokeWidth={1}
              />
            ) : null}

            {index % 6 === 0 || midnight ? (
              <text
                x={plot.x(index)}
                y={HEIGHT - PADDING.bottom + 16}
                textAnchor="middle"
                fontSize={9}
                className="measured"
                fill="var(--text-tertiary)"
              >
                {midnight
                  ? formatWeekdayShort(hour.time, timezone)
                  : formatHour(hour.time, timezone, { hour12 })}
              </text>
            ) : null}
          </g>
        );
      })}

      {nowIndex > 0 ? (
        <g>
          <line
            x1={plot.x(nowIndex)}
            x2={plot.x(nowIndex)}
            y1={PADDING.top - 10}
            y2={HEIGHT - PADDING.bottom}
            stroke="var(--text-tertiary)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={plot.x(nowIndex)}
            y={PADDING.top - 14}
            textAnchor="middle"
            fontSize={8.5}
            className="measured"
            fill="var(--text-tertiary)"
          >
            NOW
          </text>
        </g>
      ) : null}
    </g>
  );
}

function Tooltip({
  hour,
  units,
  timezone,
  hour12,
  x,
  width,
}: {
  hour: HourPoint;
  units: UnitPreferences;
  timezone: string;
  hour12: boolean;
  x: number;
  width: number;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1 w-44 -translate-x-1/2 rounded-md border border-strong bg-panel p-3",
      )}
      style={{ left: Math.min(Math.max(x, 92), width - 92) }}
    >
      <p className="measured mb-2 text-[10px] text-tertiary">
        {formatWeekdayShort(hour.time, timezone)}{" "}
        {formatHour(hour.time, timezone, { hour12 })}
      </p>

      <div className="mb-2 flex items-center gap-2">
        <WeatherGlyph glyph={glyphFor(hour.condition, hour.isDay)} size={20} />
        <span className="text-xs">{hour.condition.label}</span>
      </div>

      <dl className="flex flex-col gap-1">
        <Row label="Temp" value={formatTemperature(hour.temperature, units.temperature).display} />
        <Row label="Feels" value={formatTemperature(hour.feelsLike, units.temperature).display} />
        {hour.precipitationProbability !== undefined ? (
          <Row label="Rain" value={formatPercent(hour.precipitationProbability).display} />
        ) : null}
        <Row label="Wind" value={formatWind(hour.windSpeed, units.wind).display} />
        {hour.uvIndex !== undefined ? (
          <Row label="UV" value={String(Math.round(hour.uvIndex))} />
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] text-tertiary">{label}</dt>
      <dd className="measured text-[11px]">{value}</dd>
    </div>
  );
}

/**
 * A sentence describing the shape of the series — where it starts, where it
 * peaks, where it ends. This is what a screen reader announces instead of the
 * chart, and it is why the chart is usable without sight.
 */
function describeSeries(
  hours: HourPoint[],
  metric: HourlyMetric,
  config: MetricConfig,
  units: UnitPreferences,
  timezone: string,
  hour12: boolean,
): string {
  if (hours.length === 0) return `${METRIC_LABELS[metric]} data is unavailable.`;

  const points = hours
    .map((hour) => ({ hour, value: config.value(hour) }))
    .filter((point): point is { hour: HourPoint; value: number } => point.value !== undefined);

  if (points.length === 0) return `${METRIC_LABELS[metric]} data is unavailable.`;

  const first = points[0];
  const last = points[points.length - 1];
  const peak = points.reduce((best, point) => (point.value > best.value ? point : best));
  const trough = points.reduce((best, point) => (point.value < best.value ? point : best));

  const at = (point: { hour: HourPoint }) =>
    formatHour(point.hour.time, timezone, { hour12 });

  return (
    `${METRIC_LABELS[metric]} forecast: ` +
    `starts at ${config.format(first.value, units)} at ${at(first)}, ` +
    `peaks at ${config.format(peak.value, units)} around ${at(peak)}, ` +
    `lowest at ${config.format(trough.value, units)} around ${at(trough)}, ` +
    `ending at ${config.format(last.value, units)} at ${at(last)}.`
  );
}
