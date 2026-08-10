/**
 * A small fixed-window rate limiter for our own route handlers.
 *
 * The point is not to stop a determined attacker — that belongs at the edge —
 * but to keep one misbehaving client from burning through the shared
 * Open-Meteo quota that every other visitor depends on. State is per-instance,
 * which is the right trade for something this cheap.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Sweeps expired entries so the map cannot grow without bound. */
function prune(now: number): void {
  if (windows.size < 5000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets, for the `Retry-After` header. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Best-effort client identity. Behind a proxy the forwarded header is the only
 * signal available; it is spoofable, which is acceptable for quota protection
 * and would not be for anything security-sensitive.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "local";
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/** Test hook. */
export const resetRateLimits = () => windows.clear();
