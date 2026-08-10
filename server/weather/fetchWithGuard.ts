import type { ZodType } from "zod";

import { recordFailure, recordSuccess } from "@/server/telemetry";
import type { DegradationReason, Subsystem } from "@/types/weather";

/**
 * The single door every upstream request goes through.
 *
 * Nothing here throws. A weather dashboard that returns a 500 because one
 * pollutant reading was malformed is worse than useless, so failures come back
 * as values and the caller decides which panel to degrade. Between them,
 * timeout, retry, circuit breaking and schema validation cover the failure
 * modes that actually happen with public weather APIs: slow responses under
 * load, brief 5xx windows, and fields that silently go missing for a region.
 */

export type GuardResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; reason: DegradationReason; message: string; latencyMs: number };

interface GuardOptions<T> {
  subsystem: Subsystem;
  schema: ZodType<T>;
  /** Per-attempt budget. Two attempts means the worst case is roughly double. */
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /**
   * Seconds Next.js should keep the upstream response. Pair this with the
   * `cacheLife` profile of the calling `use cache` function.
   */
  revalidate?: number;
}

/* -------------------------------------------------------------------------- */
/* Circuit breaker                                                            */
/* -------------------------------------------------------------------------- */

interface Breaker {
  consecutiveFailures: number;
  openedAt?: number;
}

const FAILURE_THRESHOLD = 4;
const OPEN_DURATION_MS = 30_000;

const breakers = new Map<string, Breaker>();

function breakerFor(host: string): Breaker {
  const existing = breakers.get(host);
  if (existing) return existing;
  const created: Breaker = { consecutiveFailures: 0 };
  breakers.set(host, created);
  return created;
}

function isOpen(breaker: Breaker): boolean {
  if (breaker.openedAt === undefined) return false;
  if (Date.now() - breaker.openedAt < OPEN_DURATION_MS) return true;
  // Half-open: let one request through to test the water.
  breaker.openedAt = undefined;
  breaker.consecutiveFailures = 0;
  return false;
}

/** Test hook so breaker state does not leak between cases. */
export function resetBreakers(): void {
  breakers.clear();
}

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

const USER_AGENT_CONTACT = process.env.NWS_CONTACT_EMAIL?.trim();

/**
 * Several public agencies — the NWS most strictly — require a User-Agent that
 * identifies the caller and will throttle anonymous traffic hard.
 */
export const userAgent = (): string =>
  USER_AGENT_CONTACT
    ? `ISOBAR Weather (${USER_AGENT_CONTACT})`
    : "ISOBAR Weather (https://github.com/isobar-weather)";

const MESSAGES: Record<DegradationReason, string> = {
  timeout: "The weather service did not respond in time.",
  "rate-limited": "The weather service is rate limiting requests right now.",
  "provider-error": "The weather service returned an error.",
  malformed: "The weather service returned data we could not read.",
  unavailable: "The weather service is unreachable.",
  "not-configured": "This data source has not been configured.",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(
  url: string,
  { subsystem, schema, timeoutMs = 6000, retries = 1, headers, revalidate }: GuardOptions<T>,
): Promise<GuardResult<T>> {
  const host = new URL(url).host;
  const breaker = breakerFor(host);
  const startedAt = Date.now();

  if (isOpen(breaker)) {
    return {
      ok: false,
      reason: "unavailable",
      message: MESSAGES.unavailable,
      latencyMs: 0,
    };
  }

  let lastReason: DegradationReason = "unavailable";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json", "user-agent": userAgent(), ...headers },
        ...(revalidate === undefined ? {} : { next: { revalidate } }),
      });

      if (!response.ok) {
        lastReason = response.status === 429 ? "rate-limited" : "provider-error";

        // 4xx other than 429 will not fix itself; stop trying.
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === retries) break;

        // Honour Retry-After when the service tells us how long to wait.
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 3000)
            : 250 + Math.random() * 250,
        );
        continue;
      }

      const parsed = schema.safeParse(await response.json());

      if (!parsed.success) {
        // A shape change is not transient — retrying wastes the user's time.
        const latencyMs = Date.now() - startedAt;
        breaker.consecutiveFailures = 0;
        recordFailure(subsystem, host, "schema mismatch", latencyMs);
        return {
          ok: false,
          reason: "malformed",
          message: MESSAGES.malformed,
          latencyMs,
        };
      }

      const latencyMs = Date.now() - startedAt;
      breaker.consecutiveFailures = 0;
      breaker.openedAt = undefined;
      recordSuccess(subsystem, host, latencyMs);
      return { ok: true, data: parsed.data, latencyMs };
    } catch (error) {
      const aborted =
        error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
      lastReason = aborted ? "timeout" : "unavailable";

      if (attempt === retries) break;
      await sleep(250 + Math.random() * 250);
    }
  }

  const latencyMs = Date.now() - startedAt;
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= FAILURE_THRESHOLD && breaker.openedAt === undefined) {
    breaker.openedAt = Date.now();
  }
  recordFailure(subsystem, host, lastReason, latencyMs);

  return { ok: false, reason: lastReason, message: MESSAGES[lastReason], latencyMs };
}

/**
 * Same guarantees for endpoints that speak XML — MeteoAlarm's CAP feeds and
 * the NHC's KML products.
 */
export async function fetchText(
  url: string,
  {
    subsystem,
    timeoutMs = 6000,
    retries = 1,
    headers,
    revalidate,
  }: Omit<GuardOptions<unknown>, "schema">,
): Promise<GuardResult<string>> {
  const host = new URL(url).host;
  const breaker = breakerFor(host);
  const startedAt = Date.now();

  if (isOpen(breaker)) {
    return { ok: false, reason: "unavailable", message: MESSAGES.unavailable, latencyMs: 0 };
  }

  let lastReason: DegradationReason = "unavailable";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": userAgent(), ...headers },
        ...(revalidate === undefined ? {} : { next: { revalidate } }),
      });

      if (!response.ok) {
        lastReason = response.status === 429 ? "rate-limited" : "provider-error";
        if (response.status < 500 && response.status !== 429) break;
        if (attempt === retries) break;
        await sleep(250 + Math.random() * 250);
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      breaker.consecutiveFailures = 0;
      breaker.openedAt = undefined;
      recordSuccess(subsystem, host, latencyMs);
      return { ok: true, data: await response.text(), latencyMs };
    } catch (error) {
      const aborted =
        error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
      lastReason = aborted ? "timeout" : "unavailable";
      if (attempt === retries) break;
      await sleep(250 + Math.random() * 250);
    }
  }

  const latencyMs = Date.now() - startedAt;
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= FAILURE_THRESHOLD && breaker.openedAt === undefined) {
    breaker.openedAt = Date.now();
  }
  recordFailure(subsystem, host, lastReason, latencyMs);

  return { ok: false, reason: lastReason, message: MESSAGES[lastReason], latencyMs };
}
