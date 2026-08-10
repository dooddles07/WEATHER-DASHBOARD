import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { DEFAULT_LOCATION, LOCATION_COOKIE } from "@/lib/locations/places";
import type { GeoLocation } from "@/types/location";

/**
 * Which place the dashboard is showing.
 *
 * Held in a cookie rather than the URL so `/` stays clean and shareable links
 * go through `/weather/[slug]`, which is the page built for that purpose. The
 * cookie is read on the server, which lets the dashboard render the right city
 * in the first response instead of flashing a default and swapping.
 *
 * A cookie is user-controlled input. It is validated on every read and falls
 * back to the default rather than trusting its contents.
 *
 * The `server-only` import at the top is load-bearing: it turns a client
 * component importing this into a build error rather than a confusing runtime
 * failure about `next/headers`.
 */

const StoredLocation = z.object({
  id: z.string().max(120),
  name: z.string().max(120),
  country: z.string().max(120),
  countryCode: z.string().max(2),
  admin1: z.string().max(120).optional(),
  admin2: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().optional(),
  timezone: z.string().max(60),
  population: z.number().optional(),
  slug: z.string().max(160),
});

/** Runtime data, so callers must sit inside a Suspense boundary. */
export async function readSelectedLocation(): Promise<GeoLocation> {
  const store = await cookies();
  const raw = store.get(LOCATION_COOKIE)?.value;
  if (!raw) return DEFAULT_LOCATION;

  try {
    const parsed = StoredLocation.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
}
