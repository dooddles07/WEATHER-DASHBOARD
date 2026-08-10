import type { Metadata } from "next";
import { Suspense } from "react";

import { MapPanel } from "@/components/maps/MapPanel";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { readSelectedLocation } from "@/lib/locations/selection";
import { getRadarIndex } from "@/lib/maps/radar";
import { isOwmConfigured } from "@/lib/weather/owm";

export const metadata: Metadata = {
  title: "Radar",
  description: "Animated precipitation radar with a thirty-minute nowcast.",
};

/**
 * Radar.
 *
 * Same map engine as `/map`, but opened on the radar layer with the timeline
 * already playing — the question this page answers is "where is the rain and
 * which way is it moving", and that is a question about motion.
 */
export default function RadarPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Radar</h1>
        <p className="text-xs text-tertiary">
          Two hours of observed radar and a thirty-minute nowcast. Scrub the
          timeline to see which way cells are travelling.
        </p>
      </header>

      <Suspense
        fallback={<Skeleton className="h-[clamp(24rem,68dvh,52rem)] w-full rounded-md" />}
      >
        <RadarData />
      </Suspense>
    </div>
  );
}

async function RadarData() {
  const location = await readSelectedLocation();
  const radar = await getRadarIndex();

  if (!radar) {
    return (
      <Panel className="flex flex-col items-start gap-2 p-8">
        <p className="text-sm font-medium">Radar imagery is unavailable</p>
        <p className="max-w-prose text-xs leading-relaxed text-tertiary">
          We could not reach the radar service. The forecast, alerts and
          everything else in the app are unaffected, and this will retry
          automatically.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <MapPanel
        location={location}
        radar={radar}
        owmConfigured={isOwmConfigured()}
        initialLayer="radar"
        emphasiseTimeline
      />
      <p className="text-[11px] text-tertiary">{radar.attribution}</p>
    </div>
  );
}
