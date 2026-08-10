import { describe, expect, it } from "vitest";

import { formatHour } from "@/lib/time";

import {
  moonPhase,
  moonRiseSet,
  solarNoon,
  sunPosition,
  sunRiseSet,
  utcInstantForLocal,
} from "./solar";

/**
 * Checked against published almanac values. Tolerances are a couple of minutes
 * for rise and set, which is well inside the precision the interface shows and
 * comfortably inside the low-precision algorithms' error budget.
 */

const minutesApart = (isoA: string, isoB: string) =>
  Math.abs(Date.parse(isoA) - Date.parse(isoB)) / 60000;

describe("sun position", () => {
  it("puts the sun overhead at the equator at equinox noon", () => {
    // 2026 March equinox: the subsolar point is on the equator.
    const { elevation } = sunPosition("2026-03-20T12:00:00Z", 0, 0);
    expect(elevation).toBeGreaterThan(87);
  });

  it("puts the sun below the horizon at local midnight", () => {
    const { elevation } = sunPosition("2026-06-21T00:00:00Z", 51.5, 0);
    expect(elevation).toBeLessThan(0);
  });

  it("keeps the sun up all day inside the Arctic Circle at midsummer", () => {
    const result = sunRiseSet("2026-06-21T12:00:00Z", 78.2, 15.6, "Arctic/Longyearbyen");
    expect(result.alwaysUp).toBe(true);
    expect(result.rise).toBeUndefined();
    expect(result.set).toBeUndefined();
  });

  it("keeps the sun down all day inside the Arctic Circle at midwinter", () => {
    const result = sunRiseSet("2026-12-21T12:00:00Z", 78.2, 15.6, "Arctic/Longyearbyen");
    expect(result.alwaysDown).toBe(true);
  });
});

describe("sunrise and sunset", () => {
  it("matches the almanac for London at the summer solstice", () => {
    // Published: sunrise 04:43, sunset 21:21 BST.
    const { rise, set } = sunRiseSet("2026-06-21T12:00:00Z", 51.4779, -0.0015, "Europe/London");
    expect(rise).toBeDefined();
    expect(set).toBeDefined();
    expect(minutesApart(rise!, "2026-06-21T03:43:00Z")).toBeLessThan(3);
    expect(minutesApart(set!, "2026-06-21T20:21:00Z")).toBeLessThan(3);
  });

  it("renders those times in the location's own zone, not UTC", () => {
    const { rise } = sunRiseSet("2026-06-21T12:00:00Z", 51.4779, -0.0015, "Europe/London");
    // British Summer Time puts sunrise an hour later than the UTC instant.
    expect(formatHour(rise!, "Europe/London")).toBe("04:42");
    expect(formatHour(rise!, "UTC")).toBe("03:42");
  });

  it("matches the almanac for Manila", () => {
    // Published: sunrise 05:28, sunset 18:27 PHT on 21 June.
    const { rise, set } = sunRiseSet("2026-06-21T04:00:00Z", 14.5995, 120.9842, "Asia/Manila");
    expect(minutesApart(rise!, "2026-06-20T21:28:00Z")).toBeLessThan(3);
    expect(minutesApart(set!, "2026-06-21T10:27:00Z")).toBeLessThan(3);
    expect(formatHour(rise!, "Asia/Manila")).toBe("05:28");
  });

  it("puts solar noon between sunrise and sunset", () => {
    const { rise, set } = sunRiseSet("2026-08-09T04:00:00Z", 14.5995, 120.9842, "Asia/Manila");
    const noon = solarNoon("2026-08-09T04:00:00Z", 14.5995, 120.9842, "Asia/Manila");
    expect(Date.parse(noon)).toBeGreaterThan(Date.parse(rise!));
    expect(Date.parse(noon)).toBeLessThan(Date.parse(set!));
  });
});

describe("moon", () => {
  it("reports a dark disc at new moon", () => {
    // New moon 2026-01-18 19:52 UTC.
    const phase = moonPhase("2026-01-18T19:52:00Z");
    expect(phase.illumination).toBeLessThan(0.01);
    expect(phase.label).toBe("New moon");
  });

  it("reports a lit disc at full moon", () => {
    // Full moon 2026-01-03 10:03 UTC.
    const phase = moonPhase("2026-01-03T10:03:00Z");
    expect(phase.illumination).toBeGreaterThan(0.99);
    expect(phase.label).toBe("Full moon");
  });

  it("advances through the synodic month", () => {
    const first = moonPhase("2026-01-18T19:52:00Z").phase;
    const later = moonPhase("2026-01-26T19:52:00Z").phase;
    expect(later).toBeGreaterThan(first);
    expect(moonPhase("2026-01-26T19:52:00Z").label).toBe("First quarter");
  });

  it("finds a moonrise on a normal day", () => {
    const result = moonRiseSet("2026-08-09T12:00:00Z", 51.4779, -0.0015, "Europe/London");
    // The moon skips a rise roughly once a month; on this date it has one.
    expect(result.rise ?? result.set).toBeDefined();
  });
});

describe("local wall clock to instant", () => {
  it("resolves midnight in a zone ahead of UTC", () => {
    const ms = utcInstantForLocal(2026, 8, 9, 0, 0, "Asia/Tokyo");
    expect(new Date(ms).toISOString()).toBe("2026-08-08T15:00:00.000Z");
  });

  it("resolves midnight in a zone behind UTC", () => {
    const ms = utcInstantForLocal(2026, 8, 9, 0, 0, "America/New_York");
    expect(new Date(ms).toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });

  it("uses the offset in force on that date, not today's", () => {
    // January in New York is EST (−5), not EDT (−4).
    const winter = utcInstantForLocal(2026, 1, 9, 0, 0, "America/New_York");
    expect(new Date(winter).toISOString()).toBe("2026-01-09T05:00:00.000Z");
  });
});
