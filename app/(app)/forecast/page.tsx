import type { Metadata } from "next";
import { Suspense } from "react";

import { ForecastView } from "@/components/dashboard/ForecastView";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { readSelectedLocation } from "@/lib/locations/selection";
import { summariseDayParts } from "@/lib/weather/insights";
import { getForecastConfidence, getWeatherBundle } from "@/lib/weather/provider";

export const metadata: Metadata = {
  title: "Forecast",
  description: "Hourly detail and the next fourteen days.",
};

/**
 * The forecast deep dive.
 *
 * The dashboard answers "what is it doing"; this answers "what is it doing
 * hour by hour, and how much should I trust it that far out". Model agreement
 * is shown alongside the forecast because a five-day outlook that four models
 * disagree about is a different thing from one they all agree on, and hiding
 * that difference is how forecasts lose people's trust.
 */
export default function ForecastPage() {
  return (
    <Suspense fallback={<ForecastSkeleton />}>
      <ForecastData />
    </Suspense>
  );
}

async function ForecastData() {
  const selected = await readSelectedLocation();
  const bundle = await getWeatherBundle(selected);
  const serverNow = Date.now();

  const [confidence, dayParts] = await Promise.all([
    getForecastConfidence(bundle.location),
    Promise.resolve(
      summariseDayParts(bundle.hourly, bundle.location.timezone, serverNow),
    ),
  ]);

  return (
    <ForecastView
      bundle={bundle}
      confidence={confidence}
      dayParts={dayParts}
      serverNow={serverNow}
    />
  );
}

function ForecastSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading forecast">
      <Panel className="flex flex-col gap-4 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-56 w-full" />
      </Panel>
      <Panel className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-32" />
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </Panel>
    </div>
  );
}
