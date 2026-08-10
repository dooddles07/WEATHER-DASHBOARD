"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { LocationSearch } from "@/components/layout/LocationSearch";
import { ThemeToggle, useThemeSync } from "@/components/layout/ThemeToggle";
import { Wordmark } from "@/components/layout/Wordmark";
import { useAmbient } from "@/lib/stores/ambient";
import { usePreferences } from "@/lib/stores/preferences";
import { formatZoneOffset } from "@/lib/time";
import { cn } from "@/lib/utils/cn";
import type { GeoLocation } from "@/types/location";

/**
 * The top bar.
 *
 * Holds the four things that are needed from every page: where you are, how to
 * change it, whether anything is wrong, and how the numbers are shown. The
 * timezone badge is not decoration — when you are looking at Tokyo from
 * Manila, every time on the page is Tokyo's, and this says so.
 */

export function CommandBar({
  location,
  alertCount,
}: {
  location: GeoLocation;
  alertCount: number;
}) {
  useThemeSync();

  const temperature = useAmbient((store) => store.temperature);
  const units = usePreferences((store) => store.units);
  const setUnits = usePreferences((store) => store.setUnits);

  const metric = units.temperature === "celsius";

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-base/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
        <Link
          href="/"
          className="shrink-0 rounded-md"
          aria-label="ISOBAR, go to dashboard"
        >
          <Wordmark temperature={temperature} showText={false} className="lg:hidden" />
          <Wordmark temperature={temperature} className="hidden lg:inline-flex" />
        </Link>

        <div className="min-w-0 flex-1 lg:flex-none">
          <LocationSearch current={location} />
        </div>

        <span className="measured ml-1 hidden shrink-0 rounded-xs border border-hairline px-1.5 py-1 text-[10px] text-tertiary xl:inline">
          {formatZoneOffset(location.timezone)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/alerts"
            className={cn(
              "relative flex h-10 items-center gap-2 rounded-md px-2.5 text-sm transition-colors",
              alertCount > 0
                ? "text-primary hover:bg-[--surface-hover]"
                : "text-tertiary hover:bg-[--surface-hover] hover:text-primary",
            )}
          >
            <TriangleAlert className="size-4" aria-hidden />
            <span className="sr-only">Weather alerts</span>
            {alertCount > 0 ? (
              <span
                className="readout rounded-xs bg-primary px-1.5 py-0.5 text-[11px] text-inverse"
                aria-label={`${alertCount} active ${alertCount === 1 ? "alert" : "alerts"}`}
              >
                {alertCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={() =>
              setUnits({ temperature: metric ? "fahrenheit" : "celsius" })
            }
            aria-label={`Switch to ${metric ? "Fahrenheit" : "Celsius"}`}
            className="readout h-10 cursor-pointer rounded-md border border-hairline px-2.5 text-sm text-secondary transition-colors hover:border-strong hover:text-primary"
          >
            °{metric ? "C" : "F"}
          </button>

          <ThemeToggle className="hidden sm:flex" />
        </div>
      </div>
    </header>
  );
}
