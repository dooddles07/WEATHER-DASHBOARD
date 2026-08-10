import type { AirQuality, HourPoint } from "@/types/weather";

import { headlineIndex } from "./aqi";
import { isFrozen, isPrecipitating } from "./wmo";

/**
 * Activity scores.
 *
 * These are recommendations this application computes, not meteorological
 * measurements, and the UI labels them that way everywhere they appear. Each
 * score starts at 100 and loses points against published, inspectable rules;
 * every deduction carries the reason that produced it so the card can show its
 * working rather than asking to be trusted.
 *
 * The shape of the rules is deliberate: an activity is ruined by its worst
 * factor, not by the average of its factors. A perfect 24 °C afternoon with a
 * thunderstorm overhead is not a good afternoon for a run.
 */

export type ActivityId = "outdoor" | "running" | "beach" | "travel";

export interface ScoreFactor {
  label: string;
  /** Points deducted, always positive. */
  penalty: number;
  /** Why, in the user's language. */
  note: string;
}

export interface ActivityScore {
  id: ActivityId;
  label: string;
  score: number;
  rating: string;
  factors: ScoreFactor[];
  /** One-line verdict. */
  summary: string;
}

export interface ScoreInputs {
  hour: HourPoint;
  airQuality?: AirQuality;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const RATINGS: ReadonlyArray<{ from: number; label: string }> = [
  { from: 90, label: "Excellent" },
  { from: 75, label: "Very good" },
  { from: 60, label: "Good" },
  { from: 45, label: "Fair" },
  { from: 25, label: "Poor" },
  { from: 0, label: "Unsuitable" },
];

export const ratingFor = (score: number): string =>
  RATINGS.find((entry) => score >= entry.from)?.label ?? "Unsuitable";

/** Records a deduction only when it is large enough to be worth explaining. */
function deduct(
  factors: ScoreFactor[],
  label: string,
  penalty: number,
  note: string,
): void {
  if (penalty >= 1) factors.push({ label, penalty: Math.round(penalty), note });
}

const finish = (
  id: ActivityId,
  label: string,
  factors: ScoreFactor[],
  summaries: Record<string, string>,
): ActivityScore => {
  const score = clamp(
    100 - factors.reduce((total, factor) => total + factor.penalty, 0),
    0,
    100,
  );
  const rating = ratingFor(score);
  const worst = [...factors].sort((a, b) => b.penalty - a.penalty)[0];

  return {
    id,
    label,
    score,
    rating,
    factors: [...factors].sort((a, b) => b.penalty - a.penalty),
    summary: worst ? `${rating}. ${worst.note}` : summaries.clear,
  };
};

/* -------------------------------------------------------------------------- */
/* Shared deductions                                                          */
/* -------------------------------------------------------------------------- */

function precipitationPenalty(
  factors: ScoreFactor[],
  hour: HourPoint,
  weight: number,
): void {
  const probability = hour.precipitationProbability ?? 0;
  const amount = hour.precipitation ?? 0;

  if (probability > 10) {
    deduct(
      factors,
      "Rain chance",
      probability * weight,
      probability >= 70
        ? `Rain is likely — ${Math.round(probability)}% chance.`
        : `There is a ${Math.round(probability)}% chance of rain.`,
    );
  }

  if (amount > 0.5) {
    deduct(
      factors,
      "Rain intensity",
      Math.min(30, amount * 4) * weight * 2,
      `Around ${amount.toFixed(1)} mm expected in the hour.`,
    );
  }

  if (hour.condition.kind === "thunderstorm" || hour.condition.kind === "thunderstorm-hail") {
    deduct(factors, "Thunderstorms", 45, "Thunderstorms are forecast.");
  }
}

function airQualityPenalty(factors: ScoreFactor[], airQuality: AirQuality | undefined, weight: number): void {
  const index = airQuality ? headlineIndex(airQuality) : undefined;
  if (index === undefined || index <= 50) return;

  deduct(
    factors,
    "Air quality",
    Math.min(40, (index - 50) * 0.35) * weight,
    index > 150
      ? `Air quality is poor at ${Math.round(index)} AQI.`
      : `Air quality is reduced at ${Math.round(index)} AQI.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Activities                                                                 */
/* -------------------------------------------------------------------------- */

/** General time-outside comfort, centred on 21 °C. */
function outdoorScore({ hour, airQuality }: ScoreInputs): ActivityScore {
  const factors: ScoreFactor[] = [];
  const feels = hour.feelsLike;

  const distance = Math.abs(feels - 21);
  deduct(
    factors,
    "Temperature",
    Math.min(45, distance * 2.2),
    feels > 21
      ? `At ${Math.round(feels)}° it will feel warm.`
      : `At ${Math.round(feels)}° it will feel cool.`,
  );

  precipitationPenalty(factors, hour, 0.45);

  deduct(
    factors,
    "Wind",
    Math.min(25, Math.max(0, hour.windSpeed - 20) * 0.9),
    `Wind around ${Math.round(hour.windSpeed)} km/h.`,
  );

  if ((hour.uvIndex ?? 0) > 6) {
    deduct(
      factors,
      "UV",
      Math.min(18, ((hour.uvIndex ?? 0) - 6) * 3),
      `UV index ${Math.round(hour.uvIndex ?? 0)} — sun protection needed.`,
    );
  }

  airQualityPenalty(factors, airQuality, 1);

  if ((hour.visibility ?? 20000) < 2000) {
    deduct(factors, "Visibility", 12, "Visibility is poor.");
  }

  return finish("outdoor", "Outdoor", factors, {
    clear: "Excellent. Comfortable conditions with nothing working against you.",
  });
}

/** Running is unforgiving of heat and humidity and tolerant of cold. */
function runningScore({ hour, airQuality }: ScoreInputs): ActivityScore {
  const factors: ScoreFactor[] = [];
  const feels = hour.feelsLike;

  // Optimum around 12 °C. Heat costs roughly twice what the same distance of
  // cold does, which matches how running performance actually degrades.
  const distance = feels - 12;
  deduct(
    factors,
    "Temperature",
    Math.min(50, distance > 0 ? distance * 2.6 : Math.abs(distance) * 1.3),
    feels > 20
      ? `${Math.round(feels)}° is warm for running.`
      : `${Math.round(feels)}° is on the cool side.`,
  );

  const humidity = hour.humidity ?? 0;
  if (feels > 22 && humidity > 65) {
    deduct(
      factors,
      "Humidity",
      Math.min(20, (humidity - 65) * 0.5),
      `${Math.round(humidity)}% humidity will make it harder to cool down.`,
    );
  }

  precipitationPenalty(factors, hour, 0.3);

  deduct(
    factors,
    "Wind",
    Math.min(22, Math.max(0, hour.windSpeed - 18) * 0.8),
    `Wind around ${Math.round(hour.windSpeed)} km/h.`,
  );

  // Runners breathe far more air per minute than someone walking.
  airQualityPenalty(factors, airQuality, 1.4);

  if (isFrozen(hour.condition.kind)) {
    deduct(factors, "Underfoot", 25, "Ice or snow is likely underfoot.");
  }

  return finish("running", "Running", factors, {
    clear: "Excellent. Cool, still and clear — close to ideal running weather.",
  });
}

/** The beach wants sun and warmth, and is ruined by wind. */
function beachScore({ hour, airQuality }: ScoreInputs): ActivityScore {
  const factors: ScoreFactor[] = [];
  const feels = hour.feelsLike;

  const distance = 29 - feels;
  deduct(
    factors,
    "Temperature",
    Math.min(50, distance > 0 ? distance * 3 : Math.abs(distance) * 1.6),
    feels < 24 ? `${Math.round(feels)}° is cool for the beach.` : `${Math.round(feels)}° at the coast.`,
  );

  const cloud = hour.cloudCover ?? 0;
  if (cloud > 40) {
    deduct(
      factors,
      "Cloud",
      Math.min(22, (cloud - 40) * 0.35),
      `${Math.round(cloud)}% cloud cover.`,
    );
  }

  precipitationPenalty(factors, hour, 0.55);

  // Onshore wind is the classic beach-day spoiler.
  deduct(
    factors,
    "Wind",
    Math.min(35, Math.max(0, hour.windSpeed - 15) * 1.4),
    `Wind around ${Math.round(hour.windSpeed)} km/h.`,
  );

  if ((hour.uvIndex ?? 0) >= 11) {
    deduct(factors, "UV", 15, "Extreme UV — limit time in direct sun.");
  }

  airQualityPenalty(factors, airQuality, 0.7);

  return finish("beach", "Beach", factors, {
    clear: "Excellent. Warm, bright and calm.",
  });
}

/** Travel cares about what stops vehicles: visibility, ice, gusts, storms. */
function travelScore({ hour }: ScoreInputs): ActivityScore {
  const factors: ScoreFactor[] = [];

  const visibility = hour.visibility ?? 20000;
  if (visibility < 5000) {
    deduct(
      factors,
      "Visibility",
      Math.min(40, (5000 - visibility) / 100),
      visibility < 1000
        ? "Visibility below 1 km — expect significant delays."
        : `Visibility reduced to about ${Math.round(visibility / 1000)} km.`,
    );
  }

  const gust = hour.windGust ?? hour.windSpeed;
  if (gust > 45) {
    deduct(
      factors,
      "Gusts",
      Math.min(35, (gust - 45) * 0.9),
      `Gusts to ${Math.round(gust)} km/h — high-sided vehicles affected.`,
    );
  }

  if (isFrozen(hour.condition.kind)) {
    deduct(factors, "Ice and snow", 40, "Snow or ice is forecast on the route.");
  } else if (isPrecipitating(hour.condition.kind)) {
    deduct(
      factors,
      "Wet roads",
      Math.min(22, (hour.precipitation ?? 0) * 8 + 6),
      "Wet surfaces and spray.",
    );
  }

  if (hour.condition.kind === "thunderstorm" || hour.condition.kind === "thunderstorm-hail") {
    deduct(factors, "Thunderstorms", 30, "Thunderstorms may disrupt travel.");
  }

  if (hour.temperature <= 1 && (hour.precipitation ?? 0) > 0) {
    deduct(factors, "Freezing risk", 20, "Near-freezing with precipitation — ice is possible.");
  }

  return finish("travel", "Travel", factors, {
    clear: "Excellent. Clear, calm and dry.",
  });
}

const CALCULATORS: Record<ActivityId, (inputs: ScoreInputs) => ActivityScore> = {
  outdoor: outdoorScore,
  running: runningScore,
  beach: beachScore,
  travel: travelScore,
};

export function activityScore(id: ActivityId, inputs: ScoreInputs): ActivityScore {
  return CALCULATORS[id](inputs);
}

export function allActivityScores(inputs: ScoreInputs): ActivityScore[] {
  return (Object.keys(CALCULATORS) as ActivityId[]).map((id) =>
    CALCULATORS[id](inputs),
  );
}

/**
 * The best window in a run of hours for a given activity — the answer to
 * "when should I go out", which is more useful than any single score.
 */
export function bestWindow(
  id: ActivityId,
  hours: HourPoint[],
  airQuality: AirQuality | undefined,
  windowLength = 2,
): { start: string; end: string; score: number } | undefined {
  if (hours.length < windowLength) return undefined;

  let best: { start: string; end: string; score: number } | undefined;

  for (let index = 0; index + windowLength <= hours.length; index += 1) {
    const slice = hours.slice(index, index + windowLength);
    const mean =
      slice.reduce(
        (total, hour) => total + activityScore(id, { hour, airQuality }).score,
        0,
      ) / windowLength;

    if (!best || mean > best.score) {
      best = {
        start: slice[0].time,
        end: slice[slice.length - 1].time,
        score: Math.round(mean),
      };
    }
  }

  return best;
}
