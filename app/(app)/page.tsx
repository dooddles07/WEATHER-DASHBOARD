import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { getAlerts } from "@/lib/alerts";
import { readSelectedLocation } from "@/lib/locations/selection";
import { generateInsights } from "@/lib/weather/insights";
import { getWeatherBundle } from "@/lib/weather/provider";

/**
 * The dashboard.
 *
 * The page itself is static — only the part that depends on which place you
 * have chosen is deferred, so the skeleton ships in the prerendered HTML and
 * the real data streams in behind it. That is what keeps a cold visit painting
 * immediately rather than waiting on a weather API.
 */

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const selected = await readSelectedLocation();
  const bundle = await getWeatherBundle(selected);

  // Timestamped once on the server and passed down, so the first client render
  // matches the server's and nothing shifts during hydration.
  const serverNow = Date.now();

  const { alerts } = await getAlerts(
    bundle.location,
    bundle.hourly,
    bundle.airQuality,
  );

  const insights = generateInsights({
    location: bundle.location,
    current: bundle.current,
    hourly: bundle.hourly,
    daily: bundle.daily,
    nowcast: bundle.nowcast,
    airQuality: bundle.airQuality,
    now: serverNow,
  });

  return (
    <Dashboard
      bundle={bundle}
      insights={insights}
      alerts={alerts}
      serverNow={serverNow}
    />
  );
}
