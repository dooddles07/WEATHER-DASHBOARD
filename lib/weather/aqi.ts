import { AQI_BANDS, type Band, bandFor } from "@/lib/weather/scales";
import type { AirQuality } from "@/types/weather";

/**
 * US EPA Air Quality Index.
 *
 * The provider hands us a headline AQI, but a single number does not tell you
 * *what* is in the air. The EPA index is the maximum of per-pollutant
 * sub-indices, so computing them ourselves lets the card name the pollutant
 * actually driving the reading — which is the part that changes what someone
 * should do about it.
 *
 * Breakpoints follow the EPA's published table, including the 2024 revision to
 * the PM2.5 scale.
 */

export type Pollutant = "pm25" | "pm10" | "ozone" | "nitrogenDioxide" | "sulphurDioxide" | "carbonMonoxide";

interface Breakpoint {
  concentrationLow: number;
  concentrationHigh: number;
  indexLow: number;
  indexHigh: number;
}

const BREAKPOINTS: Record<Pollutant, Breakpoint[]> = {
  pm25: [
    { concentrationLow: 0, concentrationHigh: 9, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 9.1, concentrationHigh: 35.4, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 35.5, concentrationHigh: 55.4, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 55.5, concentrationHigh: 125.4, indexLow: 151, indexHigh: 200 },
    { concentrationLow: 125.5, concentrationHigh: 225.4, indexLow: 201, indexHigh: 300 },
    { concentrationLow: 225.5, concentrationHigh: 325.4, indexLow: 301, indexHigh: 500 },
  ],
  pm10: [
    { concentrationLow: 0, concentrationHigh: 54, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 55, concentrationHigh: 154, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 155, concentrationHigh: 254, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 255, concentrationHigh: 354, indexLow: 151, indexHigh: 200 },
    { concentrationLow: 355, concentrationHigh: 424, indexLow: 201, indexHigh: 300 },
    { concentrationLow: 425, concentrationHigh: 604, indexLow: 301, indexHigh: 500 },
  ],
  // Gas breakpoints are defined in parts per billion; see `toPpb` below.
  ozone: [
    { concentrationLow: 0, concentrationHigh: 54, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 55, concentrationHigh: 70, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 71, concentrationHigh: 85, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 86, concentrationHigh: 105, indexLow: 151, indexHigh: 200 },
    { concentrationLow: 106, concentrationHigh: 200, indexLow: 201, indexHigh: 300 },
  ],
  nitrogenDioxide: [
    { concentrationLow: 0, concentrationHigh: 53, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 54, concentrationHigh: 100, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 101, concentrationHigh: 360, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 361, concentrationHigh: 649, indexLow: 151, indexHigh: 200 },
    { concentrationLow: 650, concentrationHigh: 1249, indexLow: 201, indexHigh: 300 },
    { concentrationLow: 1250, concentrationHigh: 2049, indexLow: 301, indexHigh: 500 },
  ],
  sulphurDioxide: [
    { concentrationLow: 0, concentrationHigh: 35, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 36, concentrationHigh: 75, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 76, concentrationHigh: 185, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 186, concentrationHigh: 304, indexLow: 151, indexHigh: 200 },
  ],
  // Carbon monoxide breakpoints are in parts per million.
  carbonMonoxide: [
    { concentrationLow: 0, concentrationHigh: 4.4, indexLow: 0, indexHigh: 50 },
    { concentrationLow: 4.5, concentrationHigh: 9.4, indexLow: 51, indexHigh: 100 },
    { concentrationLow: 9.5, concentrationHigh: 12.4, indexLow: 101, indexHigh: 150 },
    { concentrationLow: 12.5, concentrationHigh: 15.4, indexLow: 151, indexHigh: 200 },
    { concentrationLow: 15.5, concentrationHigh: 30.4, indexLow: 201, indexHigh: 300 },
  ],
};

/**
 * Molar volume of an ideal gas at 25 °C and 1 atm, divided by molecular
 * weight. Providers report gases in µg/m³; the EPA table wants volume ratios.
 */
const PPB_FACTOR: Partial<Record<Pollutant, number>> = {
  ozone: 24.45 / 48,
  nitrogenDioxide: 24.45 / 46.0055,
  sulphurDioxide: 24.45 / 64.066,
  // CO is tabulated in ppm, so the factor lands three orders of magnitude down.
  carbonMonoxide: 24.45 / 28.01 / 1000,
};

const toIndexUnits = (pollutant: Pollutant, microgramsPerCubicMetre: number): number => {
  const factor = PPB_FACTOR[pollutant];
  return factor === undefined
    ? microgramsPerCubicMetre
    : microgramsPerCubicMetre * factor;
};

export interface SubIndex {
  pollutant: Pollutant;
  label: string;
  /** Original reading in µg/m³, as measured. */
  concentration: number;
  index: number;
  band: Band;
}

export const POLLUTANT_LABELS: Record<Pollutant, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  ozone: "Ozone",
  nitrogenDioxide: "Nitrogen dioxide",
  sulphurDioxide: "Sulphur dioxide",
  carbonMonoxide: "Carbon monoxide",
};

/** Linear interpolation within the EPA breakpoint containing the reading. */
export function subIndexFor(
  pollutant: Pollutant,
  microgramsPerCubicMetre: number,
): number | undefined {
  const value = toIndexUnits(pollutant, microgramsPerCubicMetre);
  const table = BREAKPOINTS[pollutant];

  const bracket =
    table.find(
      (entry) =>
        value >= entry.concentrationLow && value <= entry.concentrationHigh,
    ) ?? (value > table[table.length - 1].concentrationHigh ? table[table.length - 1] : undefined);

  if (!bracket) return undefined;

  const span = bracket.concentrationHigh - bracket.concentrationLow;
  const ratio = span === 0 ? 0 : (value - bracket.concentrationLow) / span;
  return Math.round(
    bracket.indexLow + ratio * (bracket.indexHigh - bracket.indexLow),
  );
}

export function subIndices(airQuality: AirQuality): SubIndex[] {
  const readings: Array<[Pollutant, number | undefined]> = [
    ["pm25", airQuality.pm25],
    ["pm10", airQuality.pm10],
    ["ozone", airQuality.ozone],
    ["nitrogenDioxide", airQuality.nitrogenDioxide],
    ["sulphurDioxide", airQuality.sulphurDioxide],
    ["carbonMonoxide", airQuality.carbonMonoxide],
  ];

  return readings
    .flatMap(([pollutant, concentration]) => {
      if (concentration === undefined) return [];
      const index = subIndexFor(pollutant, concentration);
      if (index === undefined) return [];
      return [
        {
          pollutant,
          label: POLLUTANT_LABELS[pollutant],
          concentration,
          index,
          band: bandFor(AQI_BANDS, index),
        },
      ];
    })
    .sort((a, b) => b.index - a.index);
}

/** The pollutant setting the overall index — the one worth naming. */
export const dominantPollutant = (airQuality: AirQuality): SubIndex | undefined =>
  subIndices(airQuality)[0];

/**
 * Plain-language guidance for each band. Deliberately about activity rather
 * than health: this describes what the air is like, and does not diagnose,
 * advise on medication, or speak to any individual's condition.
 */
export function airQualityGuidance(index: number): {
  band: Band;
  outdoorConditions: string;
  detail: string;
} {
  const band = bandFor(AQI_BANDS, index);

  if (index <= 50) {
    return {
      band,
      outdoorConditions: "Excellent",
      detail: "Air quality poses little or no risk. Good conditions for any outdoor activity.",
    };
  }
  if (index <= 100) {
    return {
      band,
      outdoorConditions: "Acceptable",
      detail:
        "Air quality is acceptable. People unusually sensitive to air pollution may notice symptoms during long or intense activity outdoors.",
    };
  }
  if (index <= 150) {
    return {
      band,
      outdoorConditions: "Reduced",
      detail:
        "Sensitive groups may be affected. Consider shortening intense outdoor activity; most people are unlikely to notice anything.",
    };
  }
  if (index <= 200) {
    return {
      band,
      outdoorConditions: "Poor",
      detail:
        "Everyone may begin to notice effects. Reduce prolonged or intense activity outdoors.",
    };
  }
  if (index <= 300) {
    return {
      band,
      outdoorConditions: "Very poor",
      detail:
        "Avoid prolonged or intense activity outdoors. Keep windows closed where practical.",
    };
  }
  return {
    band,
    outdoorConditions: "Hazardous",
    detail: "Avoid outdoor activity. Follow any guidance issued by local authorities.",
  };
}

/** Prefers the US index, falling back to the European one where that is all we have. */
export const headlineIndex = (airQuality: AirQuality): number | undefined =>
  airQuality.usAqi ?? airQuality.europeanAqi;
