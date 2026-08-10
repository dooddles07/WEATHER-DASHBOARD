import { isOwmConfigured } from "@/lib/weather/owm";
import { healthSnapshot } from "@/server/telemetry";

/**
 * Operational health.
 *
 * Reports provider latency, error rate and configuration so an outage can be
 * distinguished from a bug without reading logs. It exposes no user data and
 * no request contents — only counters — which is why it is safe to leave
 * reachable.
 */

export async function GET(): Promise<Response> {
  const providers = healthSnapshot();

  const degraded = providers.filter(
    (provider) => provider.requests > 3 && provider.failureRate > 0.25,
  );

  return Response.json(
    {
      status: degraded.length === 0 ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      configuration: {
        weatherProvider: process.env.WEATHER_PROVIDER === "mock" ? "fixtures" : "open-meteo",
        openWeatherMapLayers: isOwmConfigured(),
        forcedFailures: process.env.MOCK_FAILURE || null,
      },
      providers,
    },
    {
      status: degraded.length === 0 ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
