import type { Metadata } from "next";

import { LocationManager } from "@/components/dashboard/LocationManager";

export const metadata: Metadata = {
  title: "Locations",
  description: "Places you have saved, with current conditions for each.",
};

/**
 * Saved places.
 *
 * Fully client-rendered, because favourites live in the browser — there is no
 * account and no server copy to reconcile. Conditions for the whole list are
 * fetched in one batched request rather than one per city.
 */
export default function LocationsPage() {
  return <LocationManager />;
}
