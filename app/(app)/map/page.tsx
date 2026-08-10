import type { Metadata } from "next";
import { Suspense } from "react";

import { MapPanel } from "@/components/maps/MapPanel";
import { Skeleton } from "@/components/ui/primitives";
import { readSelectedLocation } from "@/lib/locations/selection";
import { getRadarIndex } from "@/lib/maps/radar";
import { isOwmConfigured } from "@/lib/weather/owm";

export const metadata: Metadata = {
  title: "Weather map",
  description:
    "Temperature, precipitation, wind, pressure and cloud layers over an interactive map.",
};

export default function MapPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Weather map</h1>
        <p className="text-xs text-tertiary">
          Observed radar and satellite, alongside modelled fields. The legend
          says which is which.
        </p>
      </header>

      <Suspense
        fallback={<Skeleton className="h-[clamp(24rem,68dvh,52rem)] w-full rounded-md" />}
      >
        <MapData />
      </Suspense>
    </div>
  );
}

async function MapData() {
  const location = await readSelectedLocation();
  const radar = await getRadarIndex();

  return (
    <MapPanel
      location={location}
      radar={radar}
      owmConfigured={isOwmConfigured()}
      initialLayer={isOwmConfigured() ? "temperature" : "radar"}
    />
  );
}
