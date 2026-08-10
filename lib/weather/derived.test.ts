import { describe, expect, it } from "vitest";

import type { AirQuality, HourPoint } from "@/types/weather";

import { airQualityGuidance, dominantPollutant, subIndexFor } from "./aqi";
import { beaufortFor, gustWarning } from "./beaufort";
import { generateInsights, summariseDayParts } from "./insights";
import {
  AQI_BANDS,
  bandFor,
  daylightFactor,
  highestSeverity,
  precipitationIntensity,
  sampleRamp,
  TEMPERATURE_STOPS,
  UV_BANDS,
} from "./scales";
import { activityScore, bestWindow, ratingFor } from "./scores";
import { conditionFromCode, glyphFor, isFrozen, isPrecipitating } from "./wmo";

const hour = (overrides: Partial<HourPoint> = {}): HourPoint => ({
  time: "2026-08-09T12:00:00Z",
  temperature: 21,
  feelsLike: 21,
  windSpeed: 8,
  windDirection: 180,
  isDay: true,
  condition: conditionFromCode(0),
  ...overrides,
});

/* -------------------------------------------------------------------------- */

describe("WMO codes", () => {
  it("maps the codes that change what someone wears", () => {
    expect(conditionFromCode(0).label).toBe("Clear");
    expect(conditionFromCode(95).label).toBe("Thunderstorm");
    expect(conditionFromCode(66).label).toBe("Light freezing rain");
    expect(conditionFromCode(66).disposition).toBe("severe");
  });

  it("degrades gracefully on an unknown or missing code", () => {
    expect(conditionFromCode(undefined).kind).toBe("unknown");
    expect(conditionFromCode(1234).label).toBe("Conditions unavailable");
    expect(conditionFromCode(null).code).toBe(-1);
  });

  it("distinguishes frozen from merely wet", () => {
    expect(isPrecipitating(conditionFromCode(63).kind)).toBe(true);
    expect(isFrozen(conditionFromCode(63).kind)).toBe(false);
    expect(isFrozen(conditionFromCode(73).kind)).toBe(true);
    expect(isFrozen(conditionFromCode(67).kind)).toBe(true);
    expect(isPrecipitating(conditionFromCode(0).kind)).toBe(false);
  });

  it("only swaps to a night glyph where one exists", () => {
    expect(glyphFor(conditionFromCode(0), false)).toBe("clear-night");
    expect(glyphFor(conditionFromCode(0), true)).toBe("clear");
    // Rain looks the same at midnight as at noon.
    expect(glyphFor(conditionFromCode(63), false)).toBe("rain");
  });
});

describe("colour scales", () => {
  it("returns the exact stop colour at a stop", () => {
    expect(sampleRamp(TEMPERATURE_STOPS, 16)).toBe("#e8e3c2");
  });

  it("clamps rather than extrapolating beyond the ends", () => {
    expect(sampleRamp(TEMPERATURE_STOPS, -80)).toBe("#3b4cc0");
    expect(sampleRamp(TEMPERATURE_STOPS, 90)).toBe("#b32b2b");
  });

  it("interpolates to a valid colour between stops", () => {
    const mid = sampleRamp(TEMPERATURE_STOPS, 21);
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(mid).not.toBe(sampleRamp(TEMPERATURE_STOPS, 16));
    expect(mid).not.toBe(sampleRamp(TEMPERATURE_STOPS, 26));
  });

  it("bands AQI and UV to the published categories", () => {
    expect(bandFor(AQI_BANDS, 42).label).toBe("Good");
    expect(bandFor(AQI_BANDS, 51).label).toBe("Moderate");
    expect(bandFor(AQI_BANDS, 999).label).toBe("Hazardous");
    expect(bandFor(UV_BANDS, 8).label).toBe("Very high");
    expect(bandFor(UV_BANDS, 2.9).label).toBe("Low");
  });

  it("categorises rain rate by meteorological convention", () => {
    expect(precipitationIntensity(0)).toBe("none");
    expect(precipitationIntensity(0.3)).toBe("drizzle");
    expect(precipitationIntensity(2)).toBe("light");
    expect(precipitationIntensity(5)).toBe("moderate");
    expect(precipitationIntensity(20)).toBe("heavy");
    expect(precipitationIntensity(60)).toBe("violent");
  });

  it("picks the worst severity present", () => {
    expect(highestSeverity(["information", "warning", "advisory"])).toBe("warning");
    expect(highestSeverity(["emergency", "warning"])).toBe("emergency");
    expect(highestSeverity([])).toBeUndefined();
  });

  it("ties daylight to solar elevation, not the clock", () => {
    expect(daylightFactor(-20)).toBe(0);
    expect(daylightFactor(45)).toBe(1);
    expect(daylightFactor(-3)).toBeCloseTo(0.5, 5);
  });
});

describe("Beaufort", () => {
  it("assigns the published forces", () => {
    expect(beaufortFor(0).name).toBe("Calm");
    expect(beaufortFor(15).force).toBe(3);
    expect(beaufortFor(45).name).toBe("Strong breeze");
    expect(beaufortFor(200).force).toBe(12);
  });

  it("warns on gusts by both absolute size and gust factor", () => {
    expect(gustWarning(30, undefined).level).toBe("none");
    expect(gustWarning(30, 28).level).toBe("none");
    expect(gustWarning(20, 42).level).toBe("notable");
    expect(gustWarning(30, 52).level).toBe("hazardous");
    expect(gustWarning(60, 80).level).toBe("hazardous");
  });
});

describe("air quality index", () => {
  it("reproduces the EPA breakpoints for particulates", () => {
    // 9.0 µg/m³ is the top of the Good band under the 2024 revision.
    expect(subIndexFor("pm25", 9)).toBe(50);
    expect(subIndexFor("pm25", 35.4)).toBe(100);
    expect(subIndexFor("pm10", 54)).toBe(50);
  });

  it("converts gas concentrations before applying the table", () => {
    // 100 µg/m³ of ozone is roughly 51 ppb, just into the Moderate band.
    const ozone = subIndexFor("ozone", 100);
    expect(ozone).toBeGreaterThan(45);
    expect(ozone).toBeLessThan(60);
  });

  it("names the pollutant driving the index", () => {
    const reading: AirQuality = {
      observedAt: "2026-08-09T12:00:00Z",
      pm25: 40,
      pm10: 30,
      ozone: 40,
    };
    expect(dominantPollutant(reading)?.label).toBe("PM2.5");
  });

  it("describes conditions without giving medical advice", () => {
    expect(airQualityGuidance(30).outdoorConditions).toBe("Excellent");
    expect(airQualityGuidance(120).outdoorConditions).toBe("Reduced");
    expect(airQualityGuidance(420).band.label).toBe("Hazardous");
  });
});

describe("activity scores", () => {
  it("rates a mild, still, dry hour highly", () => {
    const result = activityScore("outdoor", { hour: hour({ temperature: 21, feelsLike: 21 }) });
    expect(result.score).toBeGreaterThan(90);
    expect(result.rating).toBe("Excellent");
  });

  it("penalises thunderstorms heavily regardless of temperature", () => {
    const result = activityScore("outdoor", {
      hour: hour({ condition: conditionFromCode(95), precipitationProbability: 80, precipitation: 6 }),
    });
    expect(result.score).toBeLessThan(35);
    expect(result.factors.some((factor) => factor.label === "Thunderstorms")).toBe(true);
  });

  it("shows its working for every deduction", () => {
    const result = activityScore("running", {
      hour: hour({ temperature: 31, feelsLike: 36, humidity: 85 }),
    });
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.factors.every((factor) => factor.note.length > 0)).toBe(true);
    // Sorted worst-first so the card can lead with the real problem.
    expect(result.factors[0].penalty).toBeGreaterThanOrEqual(
      result.factors[result.factors.length - 1].penalty,
    );
  });

  it("weights each activity differently for the same weather", () => {
    const cool = hour({ temperature: 12, feelsLike: 12 });
    expect(activityScore("running", { hour: cool }).score).toBeGreaterThan(
      activityScore("beach", { hour: cool }).score,
    );
  });

  it("makes runners more sensitive to poor air than sunbathers", () => {
    const air: AirQuality = { observedAt: "2026-08-09T12:00:00Z", usAqi: 160 };
    const warm = hour({ temperature: 26, feelsLike: 27 });
    expect(activityScore("running", { hour: warm, airQuality: air }).score).toBeLessThan(
      activityScore("beach", { hour: warm, airQuality: air }).score,
    );
  });

  it("stays inside 0 and 100 under compounding penalties", () => {
    const awful = hour({
      temperature: 42,
      feelsLike: 51,
      humidity: 95,
      windSpeed: 90,
      windGust: 130,
      uvIndex: 13,
      precipitation: 40,
      precipitationProbability: 100,
      visibility: 200,
      condition: conditionFromCode(99),
    });
    const air: AirQuality = { observedAt: "2026-08-09T12:00:00Z", usAqi: 480 };
    for (const id of ["outdoor", "running", "beach", "travel"] as const) {
      const result = activityScore(id, { hour: awful, airQuality: air });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it("labels bands consistently", () => {
    expect(ratingFor(95)).toBe("Excellent");
    expect(ratingFor(60)).toBe("Good");
    expect(ratingFor(0)).toBe("Unsuitable");
  });

  it("finds the best stretch rather than the best single hour", () => {
    const hours = [
      hour({ time: "2026-08-09T08:00:00Z", precipitationProbability: 90, precipitation: 5 }),
      hour({ time: "2026-08-09T09:00:00Z", precipitationProbability: 5 }),
      hour({ time: "2026-08-09T10:00:00Z", precipitationProbability: 5 }),
      hour({ time: "2026-08-09T11:00:00Z", precipitationProbability: 80, precipitation: 4 }),
    ];
    const window = bestWindow("outdoor", hours, undefined, 2);
    expect(window?.start).toBe("2026-08-09T09:00:00Z");
    expect(window?.end).toBe("2026-08-09T10:00:00Z");
  });
});

describe("insights", () => {
  const location = {
    id: "test",
    name: "Test",
    country: "Testland",
    countryCode: "TS",
    latitude: 0,
    longitude: 0,
    timezone: "UTC",
    slug: "test",
  };

  const now = Date.parse("2026-08-09T09:00:00Z");

  it("counts down to rain when a nowcast has an onset", () => {
    const insights = generateInsights({
      location,
      hourly: [],
      daily: [],
      now,
      nowcast: {
        resolutionMinutes: 15,
        highResolution: true,
        totalMm: 3.2,
        startsAt: "2026-08-09T09:45:00Z",
        endsAt: "2026-08-09T11:00:00Z",
        steps: [
          {
            time: "2026-08-09T09:45:00Z",
            precipitation: 0.8,
            ratePerHour: 3.2,
            intensity: "moderate",
          },
        ],
      },
    });

    expect(insights[0].headline).toBe("Rain expected in 45 minutes.");
    expect(insights[0].kind).toBe("precipitation");
  });

  it("says nothing about rain when there is none to report", () => {
    const dry = Array.from({ length: 12 }, (_, index) =>
      hour({
        time: new Date(now + index * 3600_000).toISOString(),
        precipitationProbability: 5,
      }),
    );
    const insights = generateInsights({ location, hourly: dry, daily: [], now });
    const precipitation = insights.find((insight) => insight.kind === "precipitation");
    expect(precipitation?.headline).toBe("No rain expected in the next 12 hours.");
  });

  it("ranks a storm above a comfort observation", () => {
    const hours = Array.from({ length: 12 }, (_, index) =>
      hour({
        time: new Date(now + index * 3600_000).toISOString(),
        condition: index === 4 ? conditionFromCode(95) : conditionFromCode(3),
        cape: 3000,
      }),
    );

    const insights = generateInsights({
      location,
      hourly: hours,
      daily: [],
      now,
      current: { ...hour(), observedAt: "2026-08-09T09:00:00Z", feelsLike: 27, temperature: 21 },
    });

    const stormIndex = insights.findIndex((insight) => insight.kind === "storm");
    const comfortIndex = insights.findIndex((insight) => insight.kind === "comfort");
    expect(stormIndex).toBeGreaterThanOrEqual(0);
    expect(stormIndex).toBeLessThan(comfortIndex === -1 ? Infinity : comfortIndex);
  });

  it("emits nothing at all when given nothing", () => {
    expect(generateInsights({ location, hourly: [], daily: [], now })).toEqual([]);
  });

  it("summarises the day in parts people plan around", () => {
    const hours = Array.from({ length: 24 }, (_, index) =>
      hour({
        time: new Date(Date.parse("2026-08-09T06:00:00Z") + index * 3600_000).toISOString(),
        temperature: 18 + index * 0.4,
        precipitationProbability: index > 8 ? 70 : 10,
        condition: index > 8 ? conditionFromCode(63) : conditionFromCode(0),
      }),
    );

    const parts = summariseDayParts(hours, "UTC", Date.parse("2026-08-09T06:00:00Z"));
    expect(parts.map((part) => part.part)).toContain("Morning");
    expect(parts.map((part) => part.part)).toContain("Afternoon");

    const afternoon = parts.find((part) => part.part === "Afternoon");
    expect(afternoon?.summary).toContain("chance of rain");
  });
});
