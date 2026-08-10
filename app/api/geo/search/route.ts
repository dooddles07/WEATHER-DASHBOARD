import { z } from "zod";

import { geocodePostalCode } from "@/lib/weather/owm";
import { searchLocations } from "@/lib/weather/openmeteo";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";
import type { GeoLocation } from "@/types/location";

/**
 * Location search.
 *
 * Backs the command palette, so it runs on every keystroke past the second
 * character and needs to stay cheap. Three input shapes are recognised before
 * falling through to the gazetteer: bare coordinates, postal codes, and place
 * names.
 */

const Query = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  /** Country hint for postal codes, which are only unique within a country. */
  country: z.string().trim().length(2).optional(),
});

/** `14.5995, 120.9842` and friends. */
const COORDINATE_PATTERN = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const POSTAL_PATTERN = /^[A-Z0-9][A-Z0-9 -]{2,9}$/i;

export async function GET(request: Request): Promise<Response> {
  const limiter = rateLimit(`geo-search:${clientKey(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
    country: url.searchParams.get("country") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "Enter a place, postal code or coordinates." }, { status: 400 });
  }

  const { q, limit, country } = parsed.data;

  const coordinates = q.match(COORDINATE_PATTERN);
  if (coordinates) {
    const latitude = Number(coordinates[1]);
    const longitude = Number(coordinates[2]);

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return Response.json(
        { error: "Coordinates are out of range. Latitude is −90 to 90, longitude −180 to 180." },
        { status: 400 },
      );
    }

    const location: GeoLocation = {
      id: `at:${latitude.toFixed(3)},${longitude.toFixed(3)}`,
      name: `${Math.abs(latitude).toFixed(3)}° ${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(3)}° ${longitude >= 0 ? "E" : "W"}`,
      country: "",
      countryCode: "",
      latitude,
      longitude,
      // Corrected by the forecast call, which resolves the real zone.
      timezone: "UTC",
      slug: `${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    };

    return json({ results: [location] });
  }

  // A postal code only makes sense with a country, and OpenWeatherMap defaults
  // to the US when none is given — so only try it when we have a hint or the
  // query is unambiguously code-shaped and short.
  if (country && POSTAL_PATTERN.test(q) && /\d/.test(q)) {
    const postal = await geocodePostalCode(q, country);
    if (postal.ok) return json({ results: [postal.data] });
  }

  const result = await searchLocations(q, { count: limit });

  if (!result.ok) {
    return Response.json(
      { error: "Location search is unavailable right now. Try again in a moment." },
      { status: 503 },
    );
  }

  return json({ results: result.data });
}

const json = (body: unknown): Response =>
  Response.json(body, {
    headers: {
      // Place names change on a scale of years; the browser and any CDN in
      // front of us may hold this for a day.
      "cache-control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
