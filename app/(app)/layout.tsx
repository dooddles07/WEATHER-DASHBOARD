import { Suspense } from "react";

import { CommandBar } from "@/components/layout/CommandBar";
import { DesktopNav, MobileNav } from "@/components/navigation/Navigation";
import { Skeleton } from "@/components/ui/primitives";
import { getAlerts } from "@/lib/alerts";
import { readSelectedLocation } from "@/lib/locations/selection";
import { getWeatherBundle } from "@/lib/weather/provider";

/**
 * The application shell.
 *
 * The rail, the bar's frame and the mobile bar are static and ship in the
 * prerendered HTML. Only the parts that depend on which place you have chosen
 * — a cookie, and therefore request data — stream in behind a boundary, so a
 * cold visit paints the whole layout immediately.
 */

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-primary px-4 py-2 text-sm text-inverse"
      >
        Skip to content
      </a>

      <Suspense fallback={<CommandBarFallback />}>
        <CommandBarSlot />
      </Suspense>

      <div className="mx-auto flex w-full max-w-[120rem] gap-6 px-4 lg:px-6">
        <aside className="sticky top-[3.75rem] hidden h-[calc(100dvh-3.75rem)] w-52 shrink-0 py-5 lg:block">
          <DesktopNav />
        </aside>

        {/* The bottom padding clears the mobile bar; `min-w-0` stops wide
            charts and tables from forcing the whole page to scroll sideways. */}
        <main id="main" className="min-w-0 flex-1 pb-24 pt-4 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

/**
 * Reads the chosen place and counts what is currently in force.
 *
 * The bundle is already cached per location, so asking for it here costs a
 * cache read rather than a second call to the provider.
 */
async function CommandBarSlot() {
  const location = await readSelectedLocation();

  let alertCount = 0;
  try {
    const bundle = await getWeatherBundle(location, { days: 3 });
    const { alerts } = await getAlerts(bundle.location, bundle.hourly, bundle.airQuality);
    alertCount = alerts.length;
  } catch {
    // The bar must render even when every provider is down. A missing badge is
    // the right failure here — a wrong count would be worse than none.
  }

  return <CommandBar location={location} alertCount={alertCount} />;
}

function CommandBarFallback() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-base">
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
        <Skeleton className="size-[26px] rounded-full" />
        <Skeleton className="h-10 w-full sm:w-72 lg:w-96" />
        <div className="ml-auto flex gap-1.5">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="hidden h-10 w-28 sm:block" />
        </div>
      </div>
    </header>
  );
}
