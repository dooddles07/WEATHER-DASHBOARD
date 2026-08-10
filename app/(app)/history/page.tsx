import type { Metadata } from "next";
import { Suspense } from "react";

import { HistoryView } from "@/components/dashboard/HistoryView";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { readSelectedLocation } from "@/lib/locations/selection";
import { localDateKey } from "@/lib/time";
import { fetchArchive, fetchClimateNormal } from "@/lib/weather/openmeteo";
import { getWeatherBundle } from "@/lib/weather/provider";

export const metadata: Metadata = {
  title: "History",
  description: "Past weather and how today compares to the long-term average.",
};

/**
 * Weather history.
 *
 * Two questions: what has the weather actually been doing lately, and is today
 * unusual. The second needs a baseline, so the page computes a climate normal
 * from ten years of reanalysis and states the sample size — an anomaly against
 * an unstated baseline is not information.
 */
export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Weather history</h1>
        <p className="text-xs text-tertiary">
          Reanalysis data from ERA5, which lags real time by about five days.
        </p>
      </header>

      <Suspense fallback={<HistorySkeleton />}>
        <HistoryData />
      </Suspense>
    </div>
  );
}

async function HistoryData() {
  const location = await readSelectedLocation();
  const now = Date.now();

  // ERA5 is not published for the last few days, so the window stops short of
  // today rather than showing a run of empty rows.
  const end = new Date(now - 6 * 86400_000);
  const start = new Date(end.getTime() - 89 * 86400_000);

  const [archive, normal, bundle] = await Promise.all([
    fetchArchive(
      location.latitude,
      location.longitude,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    ),
    fetchClimateNormal(
      location.latitude,
      location.longitude,
      Number(localDateKey(now, location.timezone).slice(5, 7)),
    ),
    getWeatherBundle(location, { days: 2 }),
  ]);

  if (!archive.ok) {
    return (
      <Panel className="flex flex-col items-start gap-2 p-8">
        <p className="text-sm font-medium">Historical data is unavailable</p>
        <p className="max-w-prose text-xs leading-relaxed text-tertiary">
          The archive service could not be reached for this location. Everything
          else in the app is unaffected.
        </p>
      </Panel>
    );
  }

  const todayKey = localDateKey(now, location.timezone);
  const today = bundle.daily.find((day) => day.date === todayKey);

  return (
    <HistoryView
      location={location}
      observations={archive.data}
      normal={normal.ok ? normal.data : undefined}
      todayMax={today?.temperatureMax}
      todayMin={today?.temperatureMin}
    />
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading history">
      <Panel className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
      </Panel>
      <Panel className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-56 w-full" />
      </Panel>
    </div>
  );
}
