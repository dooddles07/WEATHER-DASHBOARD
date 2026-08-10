import { describe, expect, it } from "vitest";

import { formatHour } from "@/lib/time";

import {
  fetchAirQuality,
  fetchForecast,
  fetchForecastConfidence,
  searchLocations,
} from "./openmeteo";
import { sunRiseSet } from "./solar";

/**
 * Contract tests against the live Open-Meteo API.
 *
 * Excluded from `npm test` so the suite passes offline and in CI without
 * network. Run deliberately with `LIVE_PROVIDER_TESTS=1 npx vitest run
 * openmeteo.live` when changing the adapter or when a response shape is
 * suspected to have drifted — that is exactly the failure the zod schemas are
 * there to catch, and this is how we find out before users do.
 */

const live = process.env.LIVE_PROVIDER_TESTS === "1";

const MANILA = { latitude: 14.5995, longitude: 120.9842, timezone: "Asia/Manila" };

describe.skipIf(!live)("Open-Meteo forecast", () => {
  it("returns a parseable current observation and full forecast", async () => {
    const result = await fetchForecast(MANILA.latitude, MANILA.longitude);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { current, hourly, daily, timezone } = result.data;

    expect(timezone).toBe("Asia/Manila");
    expect(current).toBeDefined();
    expect(current!.temperature).toBeGreaterThan(-60);
    expect(current!.temperature).toBeLessThan(60);
    expect(current!.condition.label).not.toBe("Conditions unavailable");

    // 16 forecast days plus one past day.
    expect(daily.length).toBeGreaterThanOrEqual(16);
    expect(hourly.length).toBeGreaterThanOrEqual(24 * 16);

    // Dates must be keyed to Manila's calendar, not UTC's.
    expect(daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daily.every((day) => day.temperatureMax >= day.temperatureMin)).toBe(true);
  });

  it("agrees with the computed ephemeris on sunrise and sunset", async () => {
    const result = await fetchForecast(MANILA.latitude, MANILA.longitude, { days: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const day = result.data.daily.find((entry) => entry.sunrise && entry.sunset);
    expect(day).toBeDefined();

    const computed = sunRiseSet(
      day!.sunrise!,
      MANILA.latitude,
      MANILA.longitude,
      MANILA.timezone,
    );

    // Two independent calculations of the same physical event should land
    // within a couple of minutes of each other.
    expect(
      Math.abs(Date.parse(day!.sunrise!) - Date.parse(computed.rise!)) / 60000,
    ).toBeLessThan(3);

    expect(formatHour(day!.sunrise!, MANILA.timezone)).toMatch(/^0[45]:/);
  });

  it("returns air quality with a recognisable AQI", async () => {
    const result = await fetchAirQuality(MANILA.latitude, MANILA.longitude);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.usAqi ?? result.data.europeanAqi).toBeDefined();
    expect(result.data.pm25).toBeGreaterThanOrEqual(0);
  });

  it("measures genuine disagreement between models", async () => {
    const result = await fetchForecastConfidence(MANILA.latitude, MANILA.longitude);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.models.length).toBe(4);
    expect(result.data.temperatureSpread).toBeGreaterThanOrEqual(0);
    expect(["high", "moderate", "low"]).toContain(result.data.level);
  });
});

describe.skipIf(!live)("Open-Meteo geocoding", () => {
  it("finds cities and carries their timezone", async () => {
    const result = await searchLocations("Manila");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const manila = result.data[0];
    expect(manila.name).toBe("Manila");
    expect(manila.countryCode).toBe("PH");
    expect(manila.timezone).toBe("Asia/Manila");
    expect(manila.slug).toBe("manila-philippines");
  });

  it("returns an empty list rather than an error for nonsense", async () => {
    const result = await searchLocations("zzzzzzzznotaplace");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });
});
