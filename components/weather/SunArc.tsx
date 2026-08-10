"use client";

import { DetailRow } from "@/components/ui/primitives";
import { px } from "@/lib/utils/svg";
import { formatDuration, formatHour } from "@/lib/time";
import { sunPosition } from "@/lib/weather/solar";
import type { GeoLocation } from "@/types/location";
import type { Astronomy } from "@/types/weather";

/**
 * The sun's path across the day, and the moon's phase.
 *
 * The arc is drawn from real solar elevation rather than a decorative
 * semicircle, so at high latitudes in winter it flattens almost to the horizon
 * and the picture stays true. The marker sits at the sun's actual position for
 * the moment the dashboard is showing — which means it moves when the timeline
 * is scrubbed.
 */

const WIDTH = 260;
const HEIGHT = 92;
const HORIZON = HEIGHT - 22;

export function SunArc({
  astronomy,
  location,
  instant,
  hour12,
}: {
  astronomy: Astronomy;
  location: GeoLocation;
  instant: number;
  hour12: boolean;
}) {
  // Sample the whole local day so the curve's shape is the real one.
  const dayStart = astronomy.sunrise
    ? Date.parse(astronomy.sunrise) - 2 * 3600_000
    : instant - 12 * 3600_000;
  const dayEnd = astronomy.sunset
    ? Date.parse(astronomy.sunset) + 2 * 3600_000
    : instant + 12 * 3600_000;

  const samples = Array.from({ length: 49 }, (_, index) => {
    const ms = dayStart + ((dayEnd - dayStart) * index) / 48;
    const { elevation } = sunPosition(ms, location.latitude, location.longitude);
    return { ms, elevation };
  });

  const peak = Math.max(10, ...samples.map((sample) => sample.elevation));

  const toPoint = (ms: number, elevation: number) => ({
    x: px(((ms - dayStart) / (dayEnd - dayStart)) * WIDTH),
    y: px(HORIZON - (elevation / peak) * (HORIZON - 12)),
  });

  const path = samples
    .map((sample, index) => {
      const { x, y } = toPoint(sample.ms, sample.elevation);
      return `${index === 0 ? "M" : "L"} ${x} ${Math.min(y, HEIGHT)}`;
    })
    .join(" ");

  const current = sunPosition(instant, location.latitude, location.longitude);
  const marker = toPoint(
    Math.min(Math.max(instant, dayStart), dayEnd),
    current.elevation,
  );
  const up = current.elevation > -0.833;

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={
          astronomy.sunrise && astronomy.sunset
            ? `The sun rises at ${formatHour(astronomy.sunrise, location.timezone, { hour12 })} and sets at ${formatHour(astronomy.sunset, location.timezone, { hour12 })}. It is currently ${up ? `${Math.round(current.elevation)} degrees above the horizon` : "below the horizon"}.`
            : "Sun path unavailable for this location."
        }
      >
        <line
          x1={0}
          y1={HORIZON}
          x2={WIDTH}
          y2={HORIZON}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />
        <path d={path} fill="none" stroke="var(--text-secondary)" strokeWidth={1.4} />

        <circle
          cx={marker.x}
          cy={px(Math.min(marker.y, HORIZON))}
          r={up ? 5 : 3.5}
          fill={up ? "var(--text-primary)" : "var(--surface-panel)"}
          stroke="var(--text-primary)"
          strokeWidth={1.5}
        />
      </svg>

      <dl className="grid grid-cols-2 gap-x-6">
        <div>
          <DetailRow
            label="Sunrise"
            value={
              astronomy.sunrise
                ? formatHour(astronomy.sunrise, location.timezone, { hour12 })
                : "—"
            }
          />
          <DetailRow
            label="Sunset"
            value={
              astronomy.sunset
                ? formatHour(astronomy.sunset, location.timezone, { hour12 })
                : "—"
            }
          />
          <DetailRow
            label="Daylight"
            value={
              astronomy.daylightSeconds
                ? formatDuration(astronomy.daylightSeconds)
                : "—"
            }
          />
        </div>
        <div>
          <DetailRow
            label="Solar noon"
            value={
              astronomy.solarNoon
                ? formatHour(astronomy.solarNoon, location.timezone, { hour12 })
                : "—"
            }
          />
          <DetailRow
            label="Moonrise"
            value={
              astronomy.moonrise
                ? formatHour(astronomy.moonrise, location.timezone, { hour12 })
                : "Does not rise"
            }
          />
          <DetailRow
            label="Moonset"
            value={
              astronomy.moonset
                ? formatHour(astronomy.moonset, location.timezone, { hour12 })
                : "Does not set"
            }
          />
        </div>
      </dl>

      <div className="flex items-center gap-3 border-t border-hairline pt-3">
        <MoonDisc phase={astronomy.moonPhase} />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{astronomy.moonPhaseLabel}</span>
          <span className="text-xs text-tertiary">
            {Math.round(astronomy.moonIllumination * 100)}% illuminated
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The moon at its current phase. The terminator is an ellipse whose width
 * follows the phase angle, which is how the real thing behaves — a crescent is
 * a circle overlapping an ellipse, not a circle overlapping a circle.
 */
function MoonDisc({ phase }: { phase: number }) {
  const radius = 14;
  // 0 at new and full, ±1 at the quarters.
  const terminator = Math.cos(phase * 2 * Math.PI);
  const waxing = phase < 0.5;

  return (
    <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx={16} cy={16} r={radius} fill="var(--surface-sunken)" stroke="var(--line-strong)" />
      <path
        d={`M 16 ${16 - radius}
            A ${radius} ${radius} 0 0 ${waxing ? 1 : 0} 16 ${16 + radius}
            A ${px(Math.abs(terminator) * radius)} ${radius} 0 0 ${
              terminator > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0
            } 16 ${16 - radius} Z`}
        fill="var(--text-secondary)"
      />
    </svg>
  );
}
