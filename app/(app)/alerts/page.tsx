import type { Metadata } from "next";
import { Suspense } from "react";

import { AlertCenter } from "@/components/alerts/AlertCenter";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { getAlerts } from "@/lib/alerts";
import { readSelectedLocation } from "@/lib/locations/selection";
import { getWeatherBundle } from "@/lib/weather/provider";

export const metadata: Metadata = {
  title: "Alerts",
  description: "Severe weather warnings and advisories for your location.",
};

export default function AlertsPage() {
  return (
    <Suspense fallback={<AlertsSkeleton />}>
      <AlertsData />
    </Suspense>
  );
}

async function AlertsData() {
  const selected = await readSelectedLocation();
  const bundle = await getWeatherBundle(selected);
  const result = await getAlerts(bundle.location, bundle.hourly, bundle.airQuality);

  return (
    <AlertCenter
      alerts={result.alerts}
      location={bundle.location}
      derivedOnly={result.derivedOnly}
      degraded={result.degraded}
    />
  );
}

function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading alerts">
      <Skeleton className="h-5 w-48" />
      {[0, 1].map((index) => (
        <Panel key={index} className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-16 w-full" />
        </Panel>
      ))}
    </div>
  );
}
