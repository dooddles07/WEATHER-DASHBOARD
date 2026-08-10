import { describe, expect, it } from "vitest";

import {
  celsiusDeltaToFahrenheit,
  celsiusToFahrenheit,
  compassPoint,
  compassSpoken,
  fahrenheitToCelsius,
  formatDistance,
  formatPrecipitation,
  formatPressure,
  formatTemperature,
  formatTemperatureDelta,
  formatWind,
  kmhToKnots,
  kmhToMph,
  kmhToMs,
} from "./units";

describe("temperature", () => {
  it("converts the fixed points", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
    expect(fahrenheitToCelsius(32)).toBe(0);
  });

  it("round-trips", () => {
    expect(fahrenheitToCelsius(celsiusToFahrenheit(23.4))).toBeCloseTo(23.4, 10);
  });

  it("converts a difference without the offset", () => {
    // A 5 °C rise is a 9 °F rise, not 41 °F. Anomalies depend on this.
    expect(celsiusDeltaToFahrenheit(5)).toBe(9);
    expect(formatTemperatureDelta(3.4, "celsius").display).toBe("+3.4°C");
    expect(formatTemperatureDelta(3.4, "fahrenheit").value).toBeCloseTo(6.1, 1);
    expect(formatTemperatureDelta(-2, "celsius").display).toBe("-2°C");
  });

  it("formats bare degrees by default", () => {
    expect(formatTemperature(28.6, "celsius").display).toBe("29°");
    expect(formatTemperature(28.6, "celsius", { withUnit: true }).display).toBe("29°C");
    expect(formatTemperature(0, "fahrenheit").display).toBe("32°");
  });
});

describe("wind", () => {
  it("converts to every supported unit", () => {
    expect(kmhToMph(100)).toBeCloseTo(62.137, 3);
    expect(kmhToMs(36)).toBeCloseTo(10, 10);
    expect(kmhToKnots(100)).toBeCloseTo(53.996, 3);
  });

  it("keeps a decimal for m/s only", () => {
    expect(formatWind(14, "kmh").display).toBe("14 km/h");
    expect(formatWind(36, "ms").display).toBe("10 m/s");
    expect(formatWind(14, "mph").display).toBe("9 mph");
  });
});

describe("pressure, precipitation and distance", () => {
  it("converts pressure to inches of mercury", () => {
    expect(formatPressure(1013.25, "hpa").display).toBe("1013 hPa");
    expect(formatPressure(1013.25, "inhg").value).toBeCloseTo(29.92, 2);
  });

  it("converts precipitation", () => {
    expect(formatPrecipitation(25.4, "inch").value).toBe(1);
    expect(formatPrecipitation(2.55, "mm").display).toBe("2.6 mm");
  });

  it("keeps a decimal for short visibility", () => {
    expect(formatDistance(500, "km").display).toBe("0.5 km");
    expect(formatDistance(24000, "km").display).toBe("24 km");
    expect(formatDistance(1609.344, "miles").display).toBe("1 mi");
  });
});

describe("compass", () => {
  it("maps degrees to the 16-point rose", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(360)).toBe("N");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(45)).toBe("NE");
    expect(compassPoint(22.5)).toBe("NNE");
  });

  it("wraps past the ends of the range", () => {
    expect(compassPoint(-90)).toBe("W");
    expect(compassPoint(719)).toBe("N");
    expect(compassPoint(348.75)).toBe("N");
  });

  it("spells the direction for screen readers", () => {
    expect(compassSpoken(225)).toBe("southwest");
  });
});
