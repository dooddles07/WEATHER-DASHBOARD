"use client";

import { area, curveMonotoneX, line } from "d3-shape";
import { Pin, PinOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useScrub } from "@/lib/stores/scrub";
import { formatHour, formatWeekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import { interpolateHour } from "@/lib/weather/interpolate";
import {
  daylightFactor,
  rainColor,
  snowColor,
  temperatureColor,
} from "@/lib/weather/scales";
import { sunPosition } from "@/lib/weather/solar";
import { formatTemperature, type TemperatureUnit } from "@/lib/weather/units";
import { isFrozen } from "@/lib/weather/wmo";
import type { GeoLocation } from "@/types/location";
import type { HourPoint } from "@/types/weather";

/**
 * The Atmospheric Ribbon.
 *
 * One continuous strip of the next two days, and the control that retimes the
 * entire dashboard. Drag the playhead and every card below — wind, UV, air
 * quality, the sun's position — describes that moment instead of the present
 * one. Release and it springs back to now unless you pin it.
 *
 * Four quantities are layered without a legend, because each uses a channel
 * that already means something:
 *
 *   temperature   the height of the curve, tinted by the temperature scale
 *   precipitation bars rising from the baseline, in the rain or snow scale
 *   daylight      the background luminance, from real solar elevation
 *   time          sunrise and sunset notches, and six-hourly ticks
 *
 * The vertical gradient is the detail that makes it readable: because the
 * curve's height *is* temperature, a gradient mapping y to the temperature
 * scale colours every point of the line by its own value.
 */

const HEIGHT = { base: 104, lg: 148 };
/** The bottom band is a reserved lane for the sunrise and sunset markers. */
const PADDING = { top: 22, bottom: 32 };
/** Hours of history kept on screen, so "now" has context behind it. */
const PAST_HOURS = 6;
const FUTURE_HOURS = 48;

export interface AtmosphericRibbonProps {
  hours: HourPoint[];
  location: GeoLocation;
  unit: TemperatureUnit;
  hour12: boolean;
  /** Server time, so the first paint matches between server and client. */
  serverNow: number;
}

export function AtmosphericRibbon({
  hours,
  location,
  unit,
  hour12,
  serverNow,
}: AtmosphericRibbonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(HEIGHT.base);
  const [now, setNow] = useState(serverNow);

  const scrubbedAt = useScrub((state) => state.scrubbedAt);
  const scrubTo = useScrub((state) => state.scrubTo);
  const setDragging = useScrub((state) => state.setDragging);
  const pinned = useScrub((state) => state.pinned);
  const togglePin = useScrub((state) => state.togglePin);
  const returnToNow = useScrub((state) => state.returnToNow);

  /* ------------------------------------------------------------- Measurement */

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(window.innerWidth >= 1024 ? HEIGHT.lg : HEIGHT.base);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, []);

  /* ------------------------------------------------------------------ Window */

  const window_ = useMemo(() => {
    const from = now - PAST_HOURS * 3600_000;
    const to = now + FUTURE_HOURS * 3600_000;
    const visible = hours.filter((hour) => {
      const ms = Date.parse(hour.time);
      return ms >= from - 3600_000 && ms <= to + 3600_000;
    });
    return { from, to, visible };
  }, [hours, now]);

  const { from, to, visible } = window_;

  const scales = useMemo(() => {
    if (visible.length === 0 || width === 0) return undefined;

    const temperatures = visible.map((hour) => hour.temperature);
    const min = Math.min(...temperatures);
    const max = Math.max(...temperatures);
    // A degree of headroom stops a flat day from rendering as a straight line
    // pinned to the top of the band.
    const pad = Math.max(1.5, (max - min) * 0.25);

    const x = (ms: number) => ((ms - from) / (to - from)) * width;
    const plotTop = PADDING.top;
    const plotBottom = height - PADDING.bottom;
    const y = (value: number) =>
      plotBottom - ((value - (min - pad)) / (max + pad - (min - pad))) * (plotBottom - plotTop);

    return { x, y, min: min - pad, max: max + pad, plotTop, plotBottom };
  }, [visible, width, height, from, to]);

  /* ---------------------------------------------------------------- Playhead */

  const active = scrubbedAt ?? now;
  const activeHour = useMemo(() => interpolateHour(hours, active), [hours, active]);

  const instantFromClientX = useCallback(
    (clientX: number): number => {
      const element = containerRef.current;
      if (!element) return now;
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return from + ratio * (to - from);
    },
    [from, to, now],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      scrubTo(instantFromClientX(event.clientX));
    },
    [instantFromClientX, scrubTo, setDragging],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.buttons === 0) return;
      scrubTo(instantFromClientX(event.clientX));
    },
    [instantFromClientX, scrubTo],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(false);
    },
    [setDragging],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 6 * 3600_000 : 3600_000;
      const current = scrubbedAt ?? now;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          scrubTo(Math.max(from, current - step));
          break;
        case "ArrowRight":
          event.preventDefault();
          scrubTo(Math.min(to, current + step));
          break;
        case "Home":
          event.preventDefault();
          returnToNow();
          break;
        case "End":
          event.preventDefault();
          scrubTo(to);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          togglePin();
          break;
        default:
          break;
      }
    },
    [scrubbedAt, now, from, to, scrubTo, returnToNow, togglePin],
  );

  /* ------------------------------------------------------------------ Render */

  const gradientId = "ribbon-temperature";
  const scrubbing = scrubbedAt !== null;

  const announcement = activeHour
    ? `${formatHour(activeHour.time, location.timezone, { hour12 })}, ${formatTemperature(activeHour.temperature, unit).display}, ${activeHour.condition.label}`
    : "";

  return (
    <section
      aria-labelledby="ribbon-heading"
      className="relative border-y border-hairline bg-panel"
    >
      <h2 id="ribbon-heading" className="sr-only">
        Two-day timeline
      </h2>

      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Scrub the forecast. The whole dashboard follows this timeline."
        aria-valuemin={from}
        aria-valuemax={to}
        aria-valuenow={active}
        aria-valuetext={announcement}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative w-full cursor-ew-resize touch-none select-none"
        style={{ height }}
      >
        {scales && width > 0 ? (
          <svg
            width={width}
            height={height}
            className="block"
            aria-hidden
            // Drawn in CSS pixels, so hairlines stay hairlines at any width.
            viewBox={`0 0 ${width} ${height}`}
          >
            <defs>
              <linearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={scales.plotBottom}
                x2={0}
                y2={scales.plotTop}
              >
                {/* Sampled across the visible range, so each height carries the
                    colour of the temperature it represents. */}
                {Array.from({ length: 10 }, (_, index) => {
                  const t = index / 9;
                  const value = scales.min + (scales.max - scales.min) * t;
                  return (
                    <stop
                      key={index}
                      offset={`${t * 100}%`}
                      stopColor={temperatureColor(value)}
                    />
                  );
                })}
              </linearGradient>

              <clipPath id="ribbon-clip">
                <rect x={0} y={0} width={width} height={height} />
              </clipPath>
            </defs>

            <g clipPath="url(#ribbon-clip)">
              <NightBands
                from={from}
                to={to}
                width={width}
                height={height}
                location={location}
              />

              <PrecipitationBars hours={visible} scales={scales} height={height} />

              <TemperatureCurve
                hours={visible}
                scales={scales}
                gradientId={gradientId}
              />

              <SunMarkers
                hours={visible}
                location={location}
                scales={scales}
                height={height}
                hour12={hour12}
              />

              <HourTicks
                from={from}
                to={to}
                scales={scales}
                height={height}
                location={location}
                hour12={hour12}
              />

              {scrubbing ? (
                <line
                  x1={scales.x(now)}
                  x2={scales.x(now)}
                  y1={0}
                  y2={height}
                  stroke="var(--text-tertiary)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              ) : null}

              <line
                x1={scales.x(active)}
                x2={scales.x(active)}
                y1={0}
                y2={height}
                stroke="var(--playhead)"
                strokeWidth={1.5}
              />
              <circle
                cx={scales.x(active)}
                cy={activeHour ? scales.y(activeHour.temperature) : height / 2}
                r={4}
                fill="var(--surface-panel)"
                stroke="var(--playhead)"
                strokeWidth={2}
              />
            </g>
          </svg>
        ) : (
          <div className="h-full w-full animate-pulse bg-[--surface-hover] motion-reduce:animate-none" />
        )}

        {/* The readout tracks the playhead but stays inside the strip. */}
        {scales && activeHour && width > 0 ? (
          <div
            className="pointer-events-none absolute top-1.5 flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap rounded-xs bg-panel/90 px-1.5 py-0.5"
            style={{
              left: Math.min(Math.max(scales.x(active), 52), width - 52),
            }}
          >
            <span className="measured text-[10px] text-tertiary">
              {formatHour(activeHour.time, location.timezone, { hour12 })}
            </span>
            <span className="readout text-sm">
              {formatTemperature(activeHour.temperature, unit).display}
            </span>
          </div>
        ) : null}
      </div>

      {/* Controls sit outside the slider so they are separately reachable. */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-1.5 lg:px-6">
        <p className="text-xs text-tertiary">
          {scrubbing ? (
            <>
              Showing{" "}
              <span className="measured text-secondary">
                {activeHour
                  ? `${formatWeekdayShort(activeHour.time, location.timezone)} ${formatHour(activeHour.time, location.timezone, { hour12 })}`
                  : ""}
              </span>
            </>
          ) : (
            "Drag the timeline to retime the dashboard"
          )}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
              pinned
                ? "bg-primary text-inverse"
                : "text-tertiary hover:bg-[--surface-hover] hover:text-primary",
            )}
          >
            {pinned ? <Pin className="size-3.5" aria-hidden /> : <PinOff className="size-3.5" aria-hidden />}
            {pinned ? "Pinned" : "Pin"}
          </button>

          <button
            type="button"
            onClick={returnToNow}
            disabled={!scrubbing}
            className="h-8 cursor-pointer rounded-md px-2 text-xs text-tertiary transition-colors hover:bg-[--surface-hover] hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            Now
          </button>
        </div>
      </div>

      {/* Announced on change, so the scrub is usable without seeing it. */}
      <p aria-live="polite" className="sr-only">
        {scrubbing ? announcement : ""}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Layers                                                                     */
/* -------------------------------------------------------------------------- */

interface Scales {
  x: (ms: number) => number;
  y: (value: number) => number;
  min: number;
  max: number;
  plotTop: number;
  plotBottom: number;
}

/**
 * Background luminance from real solar elevation rather than a fixed 6am–6pm
 * assumption, which is what keeps it correct in Reykjavík in June.
 */
function NightBands({
  from,
  to,
  width,
  height,
  location,
}: {
  from: number;
  to: number;
  width: number;
  height: number;
  location: GeoLocation;
}) {
  const bands = useMemo(() => {
    const step = (to - from) / 96;
    return Array.from({ length: 96 }, (_, index) => {
      const ms = from + index * step;
      const { elevation } = sunPosition(ms, location.latitude, location.longitude);
      return {
        x: (index / 96) * width,
        width: width / 96 + 1,
        light: daylightFactor(elevation),
      };
    });
  }, [from, to, width, location.latitude, location.longitude]);

  return (
    <g>
      {bands.map((band, index) => (
        <rect
          key={index}
          x={band.x}
          y={0}
          width={band.width}
          height={height}
          fill="var(--ribbon-night)"
          opacity={1 - band.light}
        />
      ))}
    </g>
  );
}

/**
 * Bars from the baseline. The square-root scale is deliberate: a linear one
 * makes drizzle invisible next to a downpour, and knowing that it is raining
 * at all is the more common question.
 */
function PrecipitationBars({
  hours,
  scales,
  height,
}: {
  hours: HourPoint[];
  scales: Scales;
  height: number;
}) {
  const maxBar = 34;

  return (
    <g>
      {hours.map((hour) => {
        const amount = hour.precipitation ?? 0;
        if (amount <= 0) return null;

        const frozen = isFrozen(hour.condition.kind);
        const barHeight = Math.min(maxBar, Math.sqrt(amount) * 13);
        const x = scales.x(Date.parse(hour.time));
        const barWidth = Math.max(2, (scales.x(3600_000) - scales.x(0)) * 0.62);

        return (
          <rect
            key={hour.time}
            x={x - barWidth / 2}
            y={height - PADDING.bottom - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={frozen ? snowColor(amount) : rainColor(amount)}
            opacity={0.85}
          />
        );
      })}
    </g>
  );
}

function TemperatureCurve({
  hours,
  scales,
  gradientId,
}: {
  hours: HourPoint[];
  scales: Scales;
  gradientId: string;
}) {
  const paths = useMemo(() => {
    const points = hours.map((hour) => ({
      x: scales.x(Date.parse(hour.time)),
      y: scales.y(hour.temperature),
    }));

    // Monotone rather than a natural spline: a cubic would overshoot at a
    // sharp cold front and draw a temperature that was never forecast.
    const shape = line<{ x: number; y: number }>()
      .x((point) => point.x)
      .y((point) => point.y)
      .curve(curveMonotoneX);

    const fill = area<{ x: number; y: number }>()
      .x((point) => point.x)
      .y0(scales.plotBottom)
      .y1((point) => point.y)
      .curve(curveMonotoneX);

    return { stroke: shape(points) ?? "", fill: fill(points) ?? "" };
  }, [hours, scales]);

  return (
    <g>
      <path d={paths.fill} fill={`url(#${gradientId})`} opacity={0.16} />
      <path
        d={paths.stroke}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Hairline notches at sunrise and sunset, labelled on wider screens. */
function SunMarkers({
  hours,
  location,
  scales,
  height,
  hour12,
}: {
  hours: HourPoint[];
  location: GeoLocation;
  scales: Scales;
  height: number;
  hour12: boolean;
}) {
  const events = useMemo(() => {
    const found: Array<{ ms: number; kind: "sunrise" | "sunset" }> = [];

    for (let index = 1; index < hours.length; index += 1) {
      const previous = hours[index - 1];
      const current = hours[index];
      if (previous.isDay === current.isDay) continue;
      found.push({
        ms: Date.parse(current.time),
        kind: current.isDay ? "sunrise" : "sunset",
      });
    }
    return found;
  }, [hours]);

  const baseline = height - PADDING.bottom;

  return (
    <g>
      {events.map((event) => {
        const x = scales.x(event.ms);
        const rise = event.kind === "sunrise";
        // A drawn triangle rather than an arrow glyph: it stays crisp at 5px,
        // where a typographic arrow in the mono face turns to mush.
        const marker = rise
          ? `M ${x - 3.2} ${baseline + 7} L ${x} ${baseline + 2.5} L ${x + 3.2} ${baseline + 7} Z`
          : `M ${x - 3.2} ${baseline + 2.5} L ${x} ${baseline + 7} L ${x + 3.2} ${baseline + 2.5} Z`;

        return (
          <g key={`${event.kind}-${event.ms}`}>
            <line
              x1={x}
              x2={x}
              y1={baseline}
              y2={baseline + 2}
              stroke="var(--text-tertiary)"
              strokeWidth={1}
            />
            <path
              d={marker}
              fill={rise ? "var(--text-secondary)" : "none"}
              stroke="var(--text-tertiary)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={height - 4}
              textAnchor="middle"
              className="measured"
              fontSize={8.5}
              fill="var(--text-tertiary)"
            >
              {formatHour(event.ms, location.timezone, { hour12 })}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Six-hourly ticks, with the weekday shown where the day turns over. */
function HourTicks({
  from,
  to,
  scales,
  height,
  location,
  hour12,
}: {
  from: number;
  to: number;
  scales: Scales;
  height: number;
  location: GeoLocation;
  hour12: boolean;
}) {
  const ticks = useMemo(() => {
    const step = 6 * 3600_000;
    const first = Math.ceil(from / step) * step;
    const result: Array<{ ms: number; midnight: boolean }> = [];

    for (let ms = first; ms <= to; ms += step) {
      const label = formatHour(ms, location.timezone, { hour12: false });
      result.push({ ms, midnight: label.startsWith("00") });
    }
    return result;
  }, [from, to, location.timezone]);

  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick.ms}>
          <line
            x1={scales.x(tick.ms)}
            x2={scales.x(tick.ms)}
            y1={0}
            y2={height}
            stroke="var(--line-hairline)"
            strokeWidth={1}
            opacity={tick.midnight ? 0.9 : 0.45}
          />
          <text
            x={scales.x(tick.ms) + 4}
            y={12}
            className="measured"
            fontSize={9}
            fill="var(--text-tertiary)"
          >
            {tick.midnight
              ? formatWeekdayShort(tick.ms, location.timezone)
              : formatHour(tick.ms, location.timezone, { hour12 })}
          </text>
        </g>
      ))}
    </g>
  );
}
