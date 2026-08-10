"use client";

import { encodeLocationCookie, LOCATION_COOKIE } from "@/lib/locations/places";
import type { GeoLocation } from "@/types/location";

/**
 * Writes the selected location so the next server render picks it up.
 *
 * A cookie rather than a query parameter because the server needs the value to
 * render the right city in the first response. `SameSite=Lax` is enough — the
 * cookie carries no authority, only a preference — and it is deliberately not
 * `HttpOnly` because the client owns this choice.
 */
export function persistSelectedLocation(location: GeoLocation): void {
  const oneYear = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCATION_COOKIE}=${encodeLocationCookie(location)}; path=/; max-age=${oneYear}; samesite=lax${secure}`;
}
