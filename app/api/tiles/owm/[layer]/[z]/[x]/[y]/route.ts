import { isOwmLayer, owmApiKey, owmTileUrl } from "@/lib/weather/owm";
import { clientKey, rateLimit, tooManyRequests } from "@/server/ratelimit";

/**
 * OpenWeatherMap tile proxy.
 *
 * OpenWeatherMap expects the API key as a query parameter on every tile
 * request, which would publish it to anyone who opens the network panel. This
 * route accepts the tile coordinates, adds the key server-side, and streams the
 * PNG back from our own origin — so the browser never sees the credential and
 * the map layer still works.
 *
 * Tiles are immutable for their forecast window, so they are cached hard.
 */

export async function GET(
  request: Request,
  context: RouteContext<"/api/tiles/owm/[layer]/[z]/[x]/[y]">,
): Promise<Response> {
  const limiter = rateLimit(`tiles:${clientKey(request)}`, {
    // A single map pan is comfortably under a hundred tiles.
    limit: 600,
    windowMs: 60_000,
  });
  if (!limiter.allowed) return tooManyRequests(limiter.retryAfter);

  const key = owmApiKey();
  if (!key) {
    return Response.json(
      { error: "This map layer is not configured on this deployment." },
      { status: 501 },
    );
  }

  const { layer, z, x, y } = await context.params;

  if (!isOwmLayer(layer)) {
    return Response.json({ error: "Unknown map layer." }, { status: 404 });
  }

  const zoom = Number(z);
  const tileX = Number(x);
  const tileY = Number(y);
  const limit = 2 ** zoom;

  // Bound the coordinates before they reach the upstream service; unchecked
  // values here would turn the proxy into an open request forwarder.
  if (
    !Number.isInteger(zoom) ||
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    zoom < 0 ||
    zoom > 12 ||
    tileX < 0 ||
    tileX >= limit ||
    tileY < 0 ||
    tileY >= limit
  ) {
    return Response.json({ error: "Tile coordinates are out of range." }, { status: 400 });
  }

  const upstream = await fetch(owmTileUrl(layer, zoom, tileX, tileY, key), {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  }).catch(() => undefined);

  if (!upstream?.ok) {
    return new Response(null, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
