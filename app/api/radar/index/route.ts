import { getRadarIndex } from "@/lib/maps/radar";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";

/**
 * The radar frame index.
 *
 * The map needs this on the client to build its timeline, and it changes every
 * ten minutes, so it is fetched here rather than embedded in the page. Tile
 * URLs point straight at RainViewer — they carry no credential, so proxying
 * them would only add latency and cost us bandwidth.
 */

export async function GET(request: Request): Promise<Response> {
  const limiter = rateLimit(`radar:${clientKey(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const index = await getRadarIndex();

  if (!index) {
    return Response.json(
      { error: "Radar imagery is unavailable right now." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(index, {
    headers: {
      "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
