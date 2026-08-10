import { z } from "zod";

import { fetchCurrentBatch } from "@/lib/weather/openmeteo";
import { conditionFromCode, glyphFor } from "@/lib/weather/wmo";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";

/**
 * Current conditions for a handful of coordinates at once.
 *
 * Backs the weather previews in the location search and the favourites list.
 * Batching is the whole point: six places cost one upstream request, so the
 * previews can appear without threatening the shared rate limit.
 */

const Query = z.object({
  // `lat,lon;lat,lon;…`, capped so a crafted URL cannot fan out.
  points: z
    .string()
    .min(3)
    .max(300)
    .transform((value) => value.split(";").slice(0, 6))
    .pipe(
      z.array(
        z
          .string()
          .regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
          .transform((pair) => {
            const [latitude, longitude] = pair.split(",").map(Number);
            return { latitude, longitude };
          })
          .refine(
            (point) =>
              Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180,
            "Coordinates out of range",
          ),
      ),
    ),
});

export async function GET(request: Request): Promise<Response> {
  const limiter = rateLimit(`geo-preview:${clientKey(request)}`, {
    limit: 40,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const url = new URL(request.url);
  const parsed = Query.safeParse({ points: url.searchParams.get("points") ?? "" });

  if (!parsed.success) {
    return Response.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const result = await fetchCurrentBatch(parsed.data.points);

  // A preview is a nicety. If it fails the search still works, so this reports
  // an empty list rather than an error the UI would have to handle.
  if (!result.ok) {
    return Response.json({ previews: [] }, { headers: { "cache-control": "no-store" } });
  }

  // The provider answers with the centre of the model grid cell, not the point
  // that was asked about — Manila goes out as 14.6042 and comes back as
  // 14.586995. Echoing the requested coordinates keeps the response joinable to
  // whatever the caller asked for; results come back in request order.
  const requested = parsed.data.points;

  const previews = result.data.map((snapshot, index) => {
    const condition = conditionFromCode(snapshot.code);
    const origin = requested[index] ?? snapshot;
    return {
      latitude: origin.latitude,
      longitude: origin.longitude,
      temperature: Math.round(snapshot.temperature),
      conditionLabel: condition.label,
      glyph: glyphFor(condition, snapshot.isDay),
    };
  });

  return Response.json(
    { previews },
    {
      headers: {
        "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
