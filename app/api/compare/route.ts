import { z } from "zod";

import { fetchComparison } from "@/lib/weather/openmeteo";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";

/**
 * Current conditions for two to five places at once.
 *
 * One upstream request regardless of how many cities are being compared, which
 * is what makes the page affordable against the shared rate limit.
 */

const Query = z.object({
  points: z
    .string()
    .min(3)
    .max(300)
    .transform((value) => value.split(";").slice(0, 5))
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
  const limiter = rateLimit(`compare:${clientKey(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const url = new URL(request.url);
  const parsed = Query.safeParse({ points: url.searchParams.get("points") ?? "" });

  if (!parsed.success) {
    return Response.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const result = await fetchComparison(parsed.data.points);

  if (!result.ok) {
    return Response.json(
      { error: "Comparison data is unavailable right now." },
      { status: 503 },
    );
  }

  return Response.json(
    { snapshots: result.data },
    {
      headers: {
        "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
