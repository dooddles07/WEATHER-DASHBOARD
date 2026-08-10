"use client";

import { Label } from "@/components/ui/primitives";
import { px } from "@/lib/utils/svg";
import { beaufortFor, gustWarning } from "@/lib/weather/beaufort";
import {
  compassPoint,
  compassSpoken,
  formatWind,
  type WindUnit,
} from "@/lib/weather/units";

/**
 * Wind, as an instrument.
 *
 * The dial answers direction at a glance and the centre answers strength, but
 * the sentence underneath is what most people actually need: 45 km/h means
 * little, "large branches move, umbrellas hard to use" means everything. That
 * is Beaufort's contribution and it still has no better replacement.
 *
 * Direction follows meteorological convention — the arrow shows where the wind
 * is coming *from*, which is what "a northerly" means.
 */

const SIZE = 132;
const CENTER = SIZE / 2;
const RADIUS = 52;

export function WindCompass({
  speed,
  direction,
  gust,
  unit,
}: {
  speed: number;
  direction: number;
  gust?: number;
  unit: WindUnit;
}) {
  const force = beaufortFor(speed);
  const warning = gustWarning(speed, gust);
  const display = formatWind(speed, unit);

  // SVG's zero angle points right; the compass's points up.
  const angle = (direction - 90) * (Math.PI / 180);
  const tipX = px(CENTER + Math.cos(angle) * (RADIUS - 12));
  const tipY = px(CENTER + Math.sin(angle) * (RADIUS - 12));
  const tailX = px(CENTER - Math.cos(angle) * (RADIUS - 26));
  const tailY = px(CENTER - Math.sin(angle) * (RADIUS - 26));

  const summary = `Wind from the ${compassSpoken(direction)} at ${display.spoken}${
    gust ? `, gusting to ${formatWind(gust, unit).spoken}` : ""
  }. Beaufort force ${force.force}, ${force.name.toLowerCase()}.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={summary}
          className="shrink-0"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--line-hairline)"
          />

          {/* Ticks every 30°, longer at the cardinals. */}
          {Array.from({ length: 12 }, (_, index) => {
            const tickAngle = (index * 30 - 90) * (Math.PI / 180);
            const cardinal = index % 3 === 0;
            const inner = RADIUS - (cardinal ? 7 : 4);
            return (
              <line
                key={index}
                x1={px(CENTER + Math.cos(tickAngle) * inner)}
                y1={px(CENTER + Math.sin(tickAngle) * inner)}
                x2={px(CENTER + Math.cos(tickAngle) * RADIUS)}
                y2={px(CENTER + Math.sin(tickAngle) * RADIUS)}
                stroke="var(--line-strong)"
                strokeWidth={cardinal ? 1.25 : 1}
                opacity={cardinal ? 1 : 0.6}
              />
            );
          })}

          {(["N", "E", "S", "W"] as const).map((point, index) => {
            const labelAngle = (index * 90 - 90) * (Math.PI / 180);
            return (
              <text
                key={point}
                x={px(CENTER + Math.cos(labelAngle) * (RADIUS + 10))}
                y={px(CENTER + Math.sin(labelAngle) * (RADIUS + 10) + 3)}
                textAnchor="middle"
                fontSize={9}
                className="measured"
                fill="var(--text-tertiary)"
              >
                {point}
              </text>
            );
          })}

          <line
            x1={tailX}
            y1={tailY}
            x2={tipX}
            y2={tipY}
            stroke="var(--text-primary)"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
          <polygon
            points={`${tipX},${tipY} ${px(tipX - Math.cos(angle - 0.42) * 9)},${px(tipY - Math.sin(angle - 0.42) * 9)} ${px(tipX - Math.cos(angle + 0.42) * 9)},${px(tipY - Math.sin(angle + 0.42) * 9)}`}
            fill="var(--text-primary)"
          />

          <text
            x={CENTER}
            y={CENTER - 2}
            textAnchor="middle"
            className="readout"
            fontSize={19}
            fill="var(--text-primary)"
          >
            {display.value}
          </text>
          <text
            x={CENTER}
            y={CENTER + 12}
            textAnchor="middle"
            fontSize={8.5}
            className="measured"
            fill="var(--text-tertiary)"
          >
            {display.unit}
          </text>
        </svg>

        <dl className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <dt>
              <Label>From</Label>
            </dt>
            <dd className="readout text-lg">{compassPoint(direction)}</dd>
          </div>

          {gust !== undefined ? (
            <div className="flex flex-col gap-1">
              <dt>
                <Label>Gusts</Label>
              </dt>
              <dd className="readout text-lg">{formatWind(gust, unit).display}</dd>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <dt>
              <Label>Beaufort</Label>
            </dt>
            <dd className="text-sm">
              <span className="readout">{force.force}</span>{" "}
              <span className="text-secondary">{force.name}</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs leading-relaxed text-tertiary">{force.onLand}.</p>

      {warning.message ? (
        <p
          className="border-l-2 pl-3 text-xs leading-relaxed text-secondary"
          style={{
            borderColor:
              warning.level === "hazardous" ? "var(--text-primary)" : "var(--line-strong)",
          }}
        >
          <span className="font-medium">
            {warning.level === "hazardous" ? "Take care. " : ""}
          </span>
          {warning.message}
        </p>
      ) : null}
    </div>
  );
}
