import { z } from "zod";

import { reverseGeocode } from "@/lib/weather/owm";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";
import type { GeoLocation } from "@/types/location";

/**
 * Turns coordinates from "Use my location" into a named place.
 *
 * Deliberately narrow: it accepts a point and returns a place, and never logs
 * or stores the coordinates. If OpenWeatherMap is not configured, it falls back
 * to a coordinate-labelled location so geolocation still works — the dashboard
 * only needs latitude and longitude to fetch weather, the name is a courtesy.
 */

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export async function GET(request: Request): Promise<Response> {
  const limiter = rateLimit(`geo-reverse:${clientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    lat: url.searchParams.get("lat"),
    lon: url.searchParams.get("lon"),
  });

  if (!parsed.success) {
    return Response.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const { lat, lon } = parsed.data;
  const result = await reverseGeocode(lat, lon);

  if (result.ok) {
    return Response.json(
      { location: result.data },
      { headers: { "cache-control": "private, max-age=600" } },
    );
  }

  const fallback: GeoLocation = {
    id: `at:${lat.toFixed(3)},${lon.toFixed(3)}`,
    name: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`,
    country: "",
    countryCode: "",
    latitude: lat,
    longitude: lon,
    timezone: "UTC",
    slug: `${lat.toFixed(3)}-${lon.toFixed(3)}`,
  };

  return Response.json(
    { location: fallback },
    { headers: { "cache-control": "private, max-age=600" } },
  );
}
