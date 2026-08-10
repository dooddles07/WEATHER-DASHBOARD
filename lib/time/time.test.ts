import { describe, expect, it } from "vitest";

import {
  dayProgress,
  formatDuration,
  formatHour,
  formatZoneOffset,
  freshness,
  fromUnixSeconds,
  isSameLocalDay,
  localDateKey,
  relativeMinutes,
  zonedParts,
} from "./index";

/**
 * The rule these tests exist to protect: weather is always shown in the local
 * time of the place being viewed. Every case below is one where doing it the
 * naive way gives the wrong answer.
 */

describe("zone-aware formatting", () => {
  const instant = "2026-08-09T15:30:00Z";

  it("renders the same instant differently per zone", () => {
    expect(formatHour(instant, "Asia/Manila")).toBe("23:30");
    expect(formatHour(instant, "Asia/Tokyo")).toBe("00:30");
    expect(formatHour(instant, "Europe/London")).toBe("16:30");
    expect(formatHour(instant, "UTC")).toBe("15:30");
  });

  it("crosses the date line correctly", () => {
    // 23:30 in Manila, but already the 10th in Tokyo.
    expect(localDateKey(instant, "Asia/Manila")).toBe("2026-08-09");
    expect(localDateKey(instant, "Asia/Tokyo")).toBe("2026-08-10");
    expect(localDateKey(instant, "Pacific/Honolulu")).toBe("2026-08-09");
  });

  it("labels the offset", () => {
    expect(formatZoneOffset("Asia/Tokyo", instant)).toBe("GMT+9");
    expect(formatZoneOffset("UTC", instant)).toBe("GMT");
  });

  it("reports British Summer Time as GMT+1 in summer and GMT in winter", () => {
    expect(formatZoneOffset("Europe/London", "2026-08-09T12:00:00Z")).toBe("GMT+1");
    expect(formatZoneOffset("Europe/London", "2026-01-09T12:00:00Z")).toBe("GMT");
  });
});

describe("daylight saving transitions", () => {
  it("keeps New York local hours correct across the spring forward", () => {
    // 2026-03-08 at 07:00 UTC is 02:00 EST; one hour later the clocks jump to
    // 04:00 EDT, so 08:00 UTC must not read as 03:00.
    expect(formatHour("2026-03-08T06:59:00Z", "America/New_York")).toBe("01:59");
    expect(formatHour("2026-03-08T07:00:00Z", "America/New_York")).toBe("03:00");
  });

  it("keeps the local date stable through the autumn fall back", () => {
    expect(localDateKey("2026-11-01T05:30:00Z", "America/New_York")).toBe("2026-11-01");
    expect(zonedParts("2026-11-01T05:30:00Z", "America/New_York").hour).toBe(1);
  });

  it("handles a zone with no DST at all", () => {
    expect(formatHour("2026-03-08T07:00:00Z", "Asia/Tokyo")).toBe("16:00");
    expect(formatHour("2026-11-01T07:00:00Z", "Asia/Tokyo")).toBe("16:00");
  });
});

describe("local day arithmetic", () => {
  it("compares days in the location's zone, not the viewer's", () => {
    // Both instants fall on 9 August in UTC, but Tokyo has already rolled over
    // to the 10th by 16:00Z.
    expect(
      isSameLocalDay("2026-08-09T14:00:00Z", "2026-08-09T16:00:00Z", "Asia/Tokyo"),
    ).toBe(false);
    expect(
      isSameLocalDay("2026-08-09T14:00:00Z", "2026-08-09T16:00:00Z", "UTC"),
    ).toBe(true);
  });

  it("reports progress through the local day", () => {
    expect(dayProgress("2026-08-09T00:00:00Z", "UTC")).toBeCloseTo(0, 5);
    expect(dayProgress("2026-08-09T12:00:00Z", "UTC")).toBeCloseTo(0.5, 5);
    expect(dayProgress("2026-08-09T18:00:00Z", "UTC")).toBeCloseTo(0.75, 5);
  });

  it("converts provider epochs", () => {
    expect(fromUnixSeconds(1770000000)).toBe("2026-02-02T02:40:00.000Z");
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");

  it("phrases recent updates", () => {
    expect(freshness("2026-08-09T11:59:40Z", now).label).toBe("Updated just now");
    expect(freshness("2026-08-09T11:59:00Z", now).label).toBe("Updated 1 minute ago");
    expect(freshness("2026-08-09T11:45:00Z", now).label).toBe("Updated 15 minutes ago");
    expect(freshness("2026-08-09T10:00:00Z", now).label).toBe("Updated 2 hours ago");
  });

  it("flags data that should no longer be presented as live", () => {
    expect(freshness("2026-08-09T11:45:00Z", now).stale).toBe(false);
    expect(freshness("2026-08-09T11:13:00Z", now).stale).toBe(true);
  });

  it("never reports a negative age when a clock is skewed", () => {
    expect(freshness("2026-08-09T12:05:00Z", now).minutes).toBe(0);
  });
});

describe("relative phrasing", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");

  it("counts down to precipitation", () => {
    expect(relativeMinutes("2026-08-09T12:45:00Z", now)).toBe("in 45 minutes");
    expect(relativeMinutes("2026-08-09T12:01:00Z", now)).toBe("in 1 minute");
    expect(relativeMinutes("2026-08-09T14:00:00Z", now)).toBe("in 2 hours");
    expect(relativeMinutes("2026-08-09T11:30:00Z", now)).toBe("30 minutes ago");
    expect(relativeMinutes("2026-08-09T12:00:20Z", now)).toBe("now");
  });

  it("formats spans", () => {
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
    expect(formatDuration(2 * 3600 + 14 * 60)).toBe("2 h 14 min");
  });
});
