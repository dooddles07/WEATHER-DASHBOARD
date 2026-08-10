import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { SeverityMark } from "@/components/alerts/SeverityMark";
import { formatHour } from "@/lib/time";
import { SEVERITY } from "@/lib/weather/scales";
import type { WeatherAlert } from "@/types/alerts";

/**
 * Severe weather, above the fold.
 *
 * Alerts are the one thing on this page that may matter more than everything
 * else combined, so they sit directly under the ribbon and are never collapsed
 * behind a badge. Severity is carried by a written level, an icon and a fill
 * pattern as well as colour — a warning has to survive a greyscale print and a
 * colour-blind reader.
 */

export function AlertBanner({
  alerts,
  timezone,
  hour12,
}: {
  alerts: WeatherAlert[];
  timezone: string;
  hour12: boolean;
}) {
  const [lead, ...rest] = alerts;
  const style = SEVERITY[lead.severity];

  return (
    <section aria-labelledby="alert-heading" className="rounded-md border border-strong">
      <h2 id="alert-heading" className="sr-only">
        Active weather alerts
      </h2>

      <Link
        href="/alerts"
        className="flex items-start gap-3 p-4 transition-colors hover:bg-[--surface-hover]"
      >
        <SeverityMark severity={lead.severity} className="mt-0.5" />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{lead.headline}</span>
            <span className="label-micro">{style.label}</span>
          </p>

          <p className="text-xs text-tertiary">
            {lead.origin === "derived" ? "Derived from forecast data" : lead.source}
            {lead.expires ? (
              <> · until {formatHour(lead.expires, timezone, { hour12 })}</>
            ) : null}
          </p>

          {rest.length > 0 ? (
            <p className="mt-1 text-xs text-secondary">
              {rest.length} other {rest.length === 1 ? "alert" : "alerts"} in force
            </p>
          ) : null}
        </div>

        <ChevronRight className="mt-1 size-4 shrink-0 text-tertiary" aria-hidden />
      </Link>
    </section>
  );
}
