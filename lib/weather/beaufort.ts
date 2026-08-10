/**
 * The Beaufort scale, in its modern WMO form.
 *
 * A wind speed on its own is hard to picture. Beaufort's descriptions are the
 * oldest and still the best answer to "what does 45 km/h actually feel like",
 * which is why the wind dashboard leads with the description and keeps the
 * number as supporting detail.
 */

export interface BeaufortForce {
  force: number;
  /** Lower bound of the force in km/h. */
  from: number;
  /** Upper bound in km/h; `Infinity` for force 12. */
  to: number;
  name: string;
  /** What you can observe on land at this force. */
  onLand: string;
}

export const BEAUFORT: readonly BeaufortForce[] = [
  { force: 0, from: 0, to: 1, name: "Calm", onLand: "Smoke rises vertically" },
  { force: 1, from: 1, to: 5, name: "Light air", onLand: "Smoke drifts, vanes still" },
  { force: 2, from: 5, to: 11, name: "Light breeze", onLand: "Leaves rustle, wind felt on face" },
  { force: 3, from: 11, to: 19, name: "Gentle breeze", onLand: "Leaves in constant motion, light flags extend" },
  { force: 4, from: 19, to: 28, name: "Moderate breeze", onLand: "Dust and loose paper lift, small branches move" },
  { force: 5, from: 28, to: 38, name: "Fresh breeze", onLand: "Small trees sway" },
  { force: 6, from: 38, to: 49, name: "Strong breeze", onLand: "Large branches move, umbrellas hard to use" },
  { force: 7, from: 49, to: 61, name: "Near gale", onLand: "Whole trees move, walking into wind is an effort" },
  { force: 8, from: 61, to: 74, name: "Gale", onLand: "Twigs break off trees, walking is difficult" },
  { force: 9, from: 74, to: 88, name: "Strong gale", onLand: "Slight structural damage, roof tiles displaced" },
  { force: 10, from: 88, to: 102, name: "Storm", onLand: "Trees uprooted, considerable structural damage" },
  { force: 11, from: 102, to: 117, name: "Violent storm", onLand: "Widespread damage" },
  {
    force: 12,
    from: 117,
    to: Number.POSITIVE_INFINITY,
    name: "Hurricane force",
    onLand: "Severe, widespread destruction",
  },
];

export function beaufortFor(kmh: number): BeaufortForce {
  return (
    BEAUFORT.find((entry) => kmh >= entry.from && kmh < entry.to) ??
    BEAUFORT[BEAUFORT.length - 1]
  );
}

/**
 * Gusts matter more than sustained wind for most people's plans. A gust factor
 * above about 1.5 with an absolute gust over gale force is the point at which
 * loose objects and cycling become genuinely hazardous.
 */
export function gustWarning(
  sustainedKmh: number,
  gustKmh: number | undefined,
): { level: "none" | "notable" | "hazardous"; message?: string } {
  if (gustKmh == null || gustKmh <= sustainedKmh) return { level: "none" };

  const factor = sustainedKmh > 0 ? gustKmh / sustainedKmh : Number.POSITIVE_INFINITY;

  if (gustKmh >= 74) {
    return {
      level: "hazardous",
      message: "Gale-force gusts. Secure loose objects and avoid exposed routes.",
    };
  }
  if (gustKmh >= 50 && factor >= 1.5) {
    return {
      level: "hazardous",
      message: "Gusts well above the sustained wind. Expect sudden strong bursts.",
    };
  }
  if (gustKmh >= 40) {
    return {
      level: "notable",
      message: "Noticeable gusts. Cycling and high-sided vehicles will feel it.",
    };
  }
  return { level: "none" };
}
