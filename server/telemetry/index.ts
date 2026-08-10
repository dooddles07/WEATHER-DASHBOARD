import type { Subsystem } from "@/types/weather";

/**
 * In-process counters for provider health.
 *
 * Deliberately not a metrics backend: this exists so `/api/health` can answer
 * "is Open-Meteo responding, and how fast" without adding infrastructure. The
 * state is per-instance and resets on deploy, which is the right trade for an
 * operational sanity check.
 */

interface Sample {
  requests: number;
  failures: number;
  /** Rolling window of recent latencies, milliseconds. */
  latencies: number[];
  lastError?: { at: string; message: string };
  lastSuccessAt?: string;
}

const LATENCY_WINDOW = 50;

const samples = new Map<string, Sample>();

const keyFor = (subsystem: Subsystem, host: string) => `${subsystem}|${host}`;

function sampleFor(subsystem: Subsystem, host: string): Sample {
  const key = keyFor(subsystem, host);
  const existing = samples.get(key);
  if (existing) return existing;
  const created: Sample = { requests: 0, failures: 0, latencies: [] };
  samples.set(key, created);
  return created;
}

export function recordSuccess(
  subsystem: Subsystem,
  host: string,
  latencyMs: number,
): void {
  const sample = sampleFor(subsystem, host);
  sample.requests += 1;
  sample.lastSuccessAt = new Date().toISOString();
  sample.latencies.push(latencyMs);
  if (sample.latencies.length > LATENCY_WINDOW) sample.latencies.shift();
}

export function recordFailure(
  subsystem: Subsystem,
  host: string,
  message: string,
  latencyMs: number,
): void {
  const sample = sampleFor(subsystem, host);
  sample.requests += 1;
  sample.failures += 1;
  sample.lastError = { at: new Date().toISOString(), message };
  sample.latencies.push(latencyMs);
  if (sample.latencies.length > LATENCY_WINDOW) sample.latencies.shift();
}

export interface ProviderHealth {
  subsystem: Subsystem;
  host: string;
  requests: number;
  failures: number;
  failureRate: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastSuccessAt?: string;
  lastError?: { at: string; message: string };
}

const quantile = (sorted: number[], q: number): number | null => {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return Math.round(sorted[index]);
};

export function healthSnapshot(): ProviderHealth[] {
  return Array.from(samples.entries()).map(([key, sample]) => {
    const [subsystem, host] = key.split("|");
    const sorted = [...sample.latencies].sort((a, b) => a - b);
    return {
      subsystem: subsystem as Subsystem,
      host,
      requests: sample.requests,
      failures: sample.failures,
      failureRate:
        sample.requests === 0
          ? 0
          : Math.round((sample.failures / sample.requests) * 1000) / 1000,
      medianLatencyMs: quantile(sorted, 0.5),
      p95LatencyMs: quantile(sorted, 0.95),
      lastSuccessAt: sample.lastSuccessAt,
      lastError: sample.lastError,
    };
  });
}

/** Test hook. Production code never needs to clear counters. */
export function resetTelemetry(): void {
  samples.clear();
}
