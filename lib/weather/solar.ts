import { zonedParts } from "@/lib/time";

/**
 * Sun and moon position.
 *
 * Open-Meteo publishes sunrise and sunset but nothing lunar, and the sun's
 * elevation through the day is what drives the ribbon's day/night shading. So
 * these are computed rather than fetched — astronomy is deterministic, and a
 * computed ephemeris is real data in a way that an invented value never is.
 *
 * The solar algorithm is the standard low-precision NOAA formulation; the
 * lunar one follows Schlyter's abridged ELP. Both are accurate to roughly an
 * arcminute, which puts rise and set times within about a minute — far finer
 * than anything the interface displays.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const sin = (deg: number) => Math.sin(deg * DEG);
const cos = (deg: number) => Math.cos(deg * DEG);
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Julian day from a JavaScript timestamp. */
const julianDay = (ms: number) => ms / 86400000 + 2440587.5;

export interface HorizontalPosition {
  /** Degrees above the horizon; negative below. */
  elevation: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
}

/* -------------------------------------------------------------------------- */
/* Sun                                                                        */
/* -------------------------------------------------------------------------- */

interface EquatorialPosition {
  rightAscension: number;
  declination: number;
  /** Greenwich mean sidereal time, degrees. */
  gmst: number;
}

function sunEquatorial(ms: number): EquatorialPosition {
  const n = julianDay(ms) - 2451545;

  const meanLongitude = norm360(280.46 + 0.9856474 * n);
  const meanAnomaly = norm360(357.528 + 0.9856003 * n);
  const eclipticLongitude =
    meanLongitude + 1.915 * sin(meanAnomaly) + 0.02 * sin(2 * meanAnomaly);
  const obliquity = 23.439 - 0.0000004 * n;

  const rightAscension = norm360(
    Math.atan2(cos(obliquity) * sin(eclipticLongitude), cos(eclipticLongitude)) * RAD,
  );
  const declination = Math.asin(sin(obliquity) * sin(eclipticLongitude)) * RAD;
  const gmst = norm360(280.46061837 + 360.98564736629 * n);

  return { rightAscension, declination, gmst };
}

function toHorizontal(
  { rightAscension, declination, gmst }: EquatorialPosition,
  latitude: number,
  longitude: number,
): HorizontalPosition {
  const hourAngle = norm360(gmst + longitude - rightAscension);

  const elevation =
    Math.asin(
      sin(latitude) * sin(declination) +
        cos(latitude) * cos(declination) * cos(hourAngle),
    ) * RAD;

  const azimuth = norm360(
    Math.atan2(
      -sin(hourAngle),
      cos(latitude) * Math.tan(declination * DEG) - sin(latitude) * cos(hourAngle),
    ) * RAD,
  );

  return { elevation, azimuth };
}

export function sunPosition(
  instant: string | number | Date,
  latitude: number,
  longitude: number,
): HorizontalPosition {
  const ms = new Date(instant).getTime();
  return toHorizontal(sunEquatorial(ms), latitude, longitude);
}

/* -------------------------------------------------------------------------- */
/* Moon                                                                       */
/* -------------------------------------------------------------------------- */

function moonEquatorial(ms: number): EquatorialPosition & { eclipticLongitude: number } {
  const d = julianDay(ms) - 2451543.5;

  // Orbital elements.
  const node = norm360(125.1228 - 0.0529538083 * d);
  const inclination = 5.1454;
  const perigee = norm360(318.0634 + 0.1643573223 * d);
  const axis = 60.2666;
  const eccentricity = 0.0549;
  const meanAnomaly = norm360(115.3654 + 13.0649929509 * d);

  // Eccentric anomaly, refined once — the Moon's eccentricity is small enough
  // that a single Newton step is well inside the precision we need.
  let eccentric =
    meanAnomaly + RAD * eccentricity * sin(meanAnomaly) * (1 + eccentricity * cos(meanAnomaly));
  eccentric =
    eccentric -
    (eccentric - RAD * eccentricity * sin(eccentric) - meanAnomaly) /
      (1 - eccentricity * cos(eccentric));

  const xv = axis * (cos(eccentric) - eccentricity);
  const yv = axis * (Math.sqrt(1 - eccentricity * eccentricity) * sin(eccentric));
  const trueAnomaly = norm360(Math.atan2(yv, xv) * RAD);

  // Ecliptic coordinates before perturbation. Geocentric distance is not
  // needed: rise and set use the standard parallax-corrected horizon, and
  // illumination comes from the phase angle.
  const u = trueAnomaly + perigee;
  let longitude = norm360(
    Math.atan2(
      sin(node) * cos(u) + cos(node) * sin(u) * cos(inclination),
      cos(node) * cos(u) - sin(node) * sin(u) * cos(inclination),
    ) * RAD,
  );
  let latitude = Math.asin(sin(u) * sin(inclination)) * RAD;

  // The Sun's elements, needed for the perturbation terms.
  const sunMeanAnomaly = norm360(356.047 + 0.9856002585 * d);
  const sunLongitude = norm360(282.9404 + 0.0000470935 * d + sunMeanAnomaly);

  const elongation = longitude - sunLongitude;
  const argumentOfLatitude = longitude - node;

  // Principal perturbations. Dropping these costs up to half a degree of
  // longitude, which is visible in rise and set times.
  longitude +=
    -1.274 * sin(meanAnomaly - 2 * elongation) +
    0.658 * sin(2 * elongation) +
    -0.186 * sin(sunMeanAnomaly) +
    -0.059 * sin(2 * meanAnomaly - 2 * elongation) +
    -0.057 * sin(meanAnomaly - 2 * elongation + sunMeanAnomaly) +
    0.053 * sin(meanAnomaly + 2 * elongation) +
    0.046 * sin(2 * elongation - sunMeanAnomaly) +
    0.041 * sin(meanAnomaly - sunMeanAnomaly) +
    -0.035 * sin(elongation) +
    -0.031 * sin(meanAnomaly + sunMeanAnomaly) +
    -0.015 * sin(2 * argumentOfLatitude - 2 * elongation) +
    0.011 * sin(meanAnomaly - 4 * elongation);

  latitude +=
    -0.173 * sin(argumentOfLatitude - 2 * elongation) +
    -0.055 * sin(meanAnomaly - argumentOfLatitude - 2 * elongation) +
    -0.046 * sin(meanAnomaly + argumentOfLatitude - 2 * elongation) +
    0.033 * sin(argumentOfLatitude + 2 * elongation) +
    0.017 * sin(2 * meanAnomaly + argumentOfLatitude);

  const obliquity = 23.4393 - 3.563e-7 * d;

  const xe = cos(longitude) * cos(latitude);
  const ye = sin(longitude) * cos(latitude) * cos(obliquity) - sin(latitude) * sin(obliquity);
  const ze = sin(longitude) * cos(latitude) * sin(obliquity) + sin(latitude) * cos(obliquity);

  return {
    rightAscension: norm360(Math.atan2(ye, xe) * RAD),
    declination: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) * RAD,
    gmst: norm360(280.46061837 + 360.98564736629 * (julianDay(ms) - 2451545)),
    eclipticLongitude: norm360(longitude),
  };
}

export function moonPosition(
  instant: string | number | Date,
  latitude: number,
  longitude: number,
): HorizontalPosition {
  const ms = new Date(instant).getTime();
  return toHorizontal(moonEquatorial(ms), latitude, longitude);
}

export interface MoonPhase {
  /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  /** Fraction of the disc lit, 0–1. */
  illumination: number;
  label: string;
}

const PHASE_LABELS: ReadonlyArray<{ upTo: number; label: string }> = [
  { upTo: 0.0325, label: "New moon" },
  { upTo: 0.2175, label: "Waxing crescent" },
  { upTo: 0.2825, label: "First quarter" },
  { upTo: 0.4675, label: "Waxing gibbous" },
  { upTo: 0.5325, label: "Full moon" },
  { upTo: 0.7175, label: "Waning gibbous" },
  { upTo: 0.7825, label: "Last quarter" },
  { upTo: 0.9675, label: "Waning crescent" },
  { upTo: 1.0001, label: "New moon" },
];

export function moonPhase(instant: string | number | Date): MoonPhase {
  const ms = new Date(instant).getTime();
  const d = julianDay(ms) - 2451543.5;

  const sunMeanAnomaly = norm360(356.047 + 0.9856002585 * d);
  const sunLongitude = norm360(
    282.9404 +
      0.0000470935 * d +
      sunMeanAnomaly +
      1.915 * sin(sunMeanAnomaly) +
      0.02 * sin(2 * sunMeanAnomaly),
  );

  const elongation = norm360(moonEquatorial(ms).eclipticLongitude - sunLongitude);
  const phase = elongation / 360;
  // Illuminated fraction of the disc from the phase angle.
  const illumination = (1 - cos(elongation)) / 2;

  return {
    phase,
    illumination,
    label: PHASE_LABELS.find((entry) => phase < entry.upTo)?.label ?? "New moon",
  };
}

/* -------------------------------------------------------------------------- */
/* Rise and set                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The UTC instant of a wall-clock time in a given zone. Resolves the offset
 * from a first guess and re-checks, which handles the DST edges where the
 * naive answer would land an hour out.
 */
export function utcInstantForLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);

  const offsetAt = (ms: number): number => {
    const parts = zonedParts(ms, timeZone);
    return (
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - ms
    );
  };

  const firstGuess = wanted - offsetAt(wanted);
  const refined = wanted - offsetAt(firstGuess);
  return refined;
}

/**
 * Standard altitudes at which a body is considered risen or set. The sun's
 * value accounts for atmospheric refraction and its apparent radius; the
 * moon's additionally accounts for its parallax.
 */
const SUN_HORIZON = -0.833;
const MOON_HORIZON = 0.125;

export interface RiseSet {
  rise?: string;
  set?: string;
  /** True when the body stays up or stays down for the whole local day. */
  alwaysUp: boolean;
  alwaysDown: boolean;
}

function findCrossings(
  startMs: number,
  horizon: number,
  altitudeAt: (ms: number) => number,
): RiseSet {
  const stepMinutes = 10;
  const steps = (24 * 60) / stepMinutes;

  let rise: number | undefined;
  let set: number | undefined;
  let everUp = false;
  let everDown = false;

  let previousMs = startMs;
  let previous = altitudeAt(previousMs) - horizon;

  for (let i = 1; i <= steps; i += 1) {
    const currentMs = startMs + i * stepMinutes * 60000;
    const current = altitudeAt(currentMs) - horizon;

    if (current > 0) everUp = true;
    else everDown = true;

    if (previous <= 0 && current > 0 && rise === undefined) {
      rise = previousMs + (currentMs - previousMs) * (-previous / (current - previous));
    }
    if (previous > 0 && current <= 0 && set === undefined) {
      set = previousMs + (currentMs - previousMs) * (previous / (previous - current));
    }

    previousMs = currentMs;
    previous = current;
  }

  return {
    rise: rise === undefined ? undefined : new Date(rise).toISOString(),
    set: set === undefined ? undefined : new Date(set).toISOString(),
    alwaysUp: everUp && !everDown,
    alwaysDown: everDown && !everUp,
  };
}

/**
 * Rise and set for the local day containing `instant`. Polar day and polar
 * night are reported explicitly rather than as missing values, because "the
 * sun does not set today" is information, not an error.
 */
export function sunRiseSet(
  instant: string | number | Date,
  latitude: number,
  longitude: number,
  timeZone: string,
): RiseSet {
  const { year, month, day } = zonedParts(instant, timeZone);
  const start = utcInstantForLocal(year, month, day, 0, 0, timeZone);
  return findCrossings(start, SUN_HORIZON, (ms) =>
    toHorizontal(sunEquatorial(ms), latitude, longitude).elevation,
  );
}

export function moonRiseSet(
  instant: string | number | Date,
  latitude: number,
  longitude: number,
  timeZone: string,
): RiseSet {
  const { year, month, day } = zonedParts(instant, timeZone);
  const start = utcInstantForLocal(year, month, day, 0, 0, timeZone);
  return findCrossings(start, MOON_HORIZON, (ms) =>
    toHorizontal(moonEquatorial(ms), latitude, longitude).elevation,
  );
}

/** The moment the sun is highest, which is rarely 12:00 local. */
export function solarNoon(
  instant: string | number | Date,
  latitude: number,
  longitude: number,
  timeZone: string,
): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  const start = utcInstantForLocal(year, month, day, 0, 0, timeZone);

  let bestMs = start;
  let bestElevation = Number.NEGATIVE_INFINITY;

  // Coarse sweep, then refine around the peak.
  for (let minutes = 0; minutes <= 1440; minutes += 10) {
    const ms = start + minutes * 60000;
    const { elevation } = toHorizontal(sunEquatorial(ms), latitude, longitude);
    if (elevation > bestElevation) {
      bestElevation = elevation;
      bestMs = ms;
    }
  }

  for (let offset = -600000; offset <= 600000; offset += 30000) {
    const ms = bestMs + offset;
    const { elevation } = toHorizontal(sunEquatorial(ms), latitude, longitude);
    if (elevation > bestElevation) {
      bestElevation = elevation;
      bestMs = ms;
    }
  }

  return new Date(bestMs).toISOString();
}
