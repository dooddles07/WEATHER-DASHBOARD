import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareView } from "@/components/dashboard/CompareView";
import { Skeleton } from "@/components/ui/primitives";
import { SUGGESTED_LOCATIONS } from "@/lib/locations/places";
import { readSelectedLocation } from "@/lib/locations/selection";

export const metadata: Metadata = {
  title: "Compare",
  description: "Current conditions for several cities side by side.",
};

export default function ComparePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <CompareData />
    </Suspense>
  );
}

async function CompareData() {
  const selected = await readSelectedLocation();

  // Opens on the place you are already looking at, plus two others, so the
  // page is useful before you have chosen anything.
  const others = SUGGESTED_LOCATIONS.filter(
    (location) => location.id !== selected.id,
  ).slice(0, 2);

  return <CompareView initial={[selected, ...others]} />;
}
