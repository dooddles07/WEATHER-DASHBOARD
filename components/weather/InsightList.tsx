import {
  CloudRain,
  Compass,
  Eye,
  Gauge,
  Sun,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";

import type { Insight, InsightKind } from "@/lib/weather/insights";

/**
 * Weather intelligence.
 *
 * Every line here was produced by a rule reading a real value in the forecast.
 * Nothing is padded out to fill the section — an empty list is a valid and
 * honest state, and it means the weather genuinely has nothing notable to say.
 *
 * Ordered by how much each item should change someone's plans, which is not
 * the same as how dramatic it sounds.
 */

const ICONS: Record<InsightKind, typeof Sun> = {
  precipitation: CloudRain,
  temperature: Thermometer,
  wind: Wind,
  uv: Sun,
  "air-quality": Gauge,
  visibility: Eye,
  comfort: Thermometer,
  planning: Compass,
  storm: Zap,
};

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        Nothing notable in the forecast. Conditions look steady.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {insights.map((insight, index) => {
        const Icon = ICONS[insight.kind];
        return (
          <li
            key={insight.id}
            className={
              index === 0
                ? "flex gap-3 pb-3"
                : "flex gap-3 border-t border-hairline py-3 last:pb-0"
            }
          >
            <Icon
              className="mt-0.5 size-4 shrink-0 text-tertiary"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm leading-snug">{insight.headline}</p>
              {insight.detail ? (
                <p className="text-xs leading-relaxed text-tertiary">
                  {insight.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
