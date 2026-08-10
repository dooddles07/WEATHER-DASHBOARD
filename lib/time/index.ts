/**
 * Time in the location's timezone, always.
 *
 * Every instant in the normalised schema is stored as a UTC ISO string. That
 * is deliberate: providers that emit naive local wall-clock strings make DST
 * transitions and midnight rollovers ambiguous, so we ask for epoch seconds
 * and format through `Intl.DateTimeFormat` with the place's IANA zone.
 *
 * The practical rule: no rendering code may call `toLocaleString` without a
 * `timeZone`, and no code may assume the viewer's zone matches the location's.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB",
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  cache.set(key, created);
  return created;
}

const toDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

/** Epoch seconds from a provider to the UTC ISO string used internally. */
export const fromUnixSeconds = (seconds: number): string =>
  new Date(seconds * 1000).toISOString();

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

export interface TimeFormatOptions {
  locale?: string;
  /**
   * 24-hour by default. A dense forecast strip needs every timestamp the same
   * width to stay aligned, and "04:43" does that where "4:43 AM" does not.
   * Settings can flip this per user.
   */
  hour12?: boolean;
}

/** `04:43`, or `4:43 AM` when the twelve-hour preference is on. */
export function formatHour(
  instant: string | number | Date,
  timeZone: string,
  { locale = "en-GB", hour12 = false }: TimeFormatOptions = {},
): string {
  return formatter(
    timeZone,
    hour12
      ? { hour: "numeric", minute: "2-digit", hour12: true }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    locale,
  ).format(toDate(instant));
}

/** Alias used where the intent is a precise clock reading rather than an hour slot. */
export const formatClock = formatHour;

/** `Tue` */
export function formatWeekdayShort(
  instant: string | number | Date,
  timeZone: string,
  locale = "en-GB",
): string {
  return formatter(timeZone, { weekday: "short" }, locale).format(toDate(instant));
}

/** `Tuesday` */
export function formatWeekdayLong(
  instant: string | number | Date,
  timeZone: string,
  locale = "en-GB",
): string {
  return formatter(timeZone, { weekday: "long" }, locale).format(toDate(instant));
}

/** `9 Aug` */
export function formatDayMonth(
  instant: string | number | Date,
  timeZone: string,
  locale = "en-GB",
): string {
  return formatter(timeZone, { day: "numeric", month: "short" }, locale).format(
    toDate(instant),
  );
}

/** `Tuesday, 9 August 2026 at 15:04` — for alert detail and tooltips. */
export function formatFull(
  instant: string | number | Date,
  timeZone: string,
  locale = "en-GB",
): string {
  return formatter(
    timeZone,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    locale,
  ).format(toDate(instant));
}

/** `GMT+9`, shown next to any location whose clock differs from the viewer's. */
export function formatZoneOffset(
  timeZone: string,
  at: string | number | Date = Date.now(),
  locale = "en-GB",
): string {
  const parts = formatter(
    timeZone,
    { timeZoneName: "shortOffset" },
    locale,
  ).formatToParts(toDate(at));
  const label = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  // ICU renders zero offset as "GMT+0" in some builds and "GMT" in others.
  // Normalise so the badge does not change shape between environments.
  return label === "GMT+0" ? "GMT" : label;
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic in a zone                                              */
/* -------------------------------------------------------------------------- */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Decomposes an instant into the wall-clock fields seen in `timeZone`. */
export function zonedParts(
  instant: string | number | Date,
  timeZone: string,
): ZonedParts {
  const dtf = formatter(
    timeZone,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    "en-GB",
  );
  const found: Record<string, string> = {};
  for (const part of dtf.formatToParts(toDate(instant))) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: Number(found.minute),
  };
}

/** Local calendar date as `YYYY-MM-DD`, which is how `DayPoint.date` is keyed. */
export function localDateKey(
  instant: string | number | Date,
  timeZone: string,
): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isSameLocalDay(
  a: string | number | Date,
  b: string | number | Date,
  timeZone: string,
): boolean {
  return localDateKey(a, timeZone) === localDateKey(b, timeZone);
}

/**
 * How far through the local day an instant sits, 0–1. Drives the sun arc and
 * the ribbon's day/night shading. Uses the zone's own wall clock, so a DST
 * jump shortens or lengthens the day exactly as it does in reality.
 */
export function dayProgress(
  instant: string | number | Date,
  timeZone: string,
): number {
  const { hour, minute } = zonedParts(instant, timeZone);
  return (hour * 60 + minute) / 1440;
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                  */
/* -------------------------------------------------------------------------- */

export interface Freshness {
  minutes: number;
  /** Phrase for the "Updated …" line. */
  label: string;
  /** Past this point the UI stops implying the reading is live. */
  stale: boolean;
}

/**
 * Weather data is only useful if you know how old it is. Anything past 30
 * minutes is reported as possibly outdated rather than presented as current.
 */
export function freshness(
  fetchedAt: string | number | Date,
  now: number = Date.now(),
  staleAfterMinutes = 30,
): Freshness {
  const minutes = Math.max(0, Math.round((now - toDate(fetchedAt).getTime()) / 60000));

  let label: string;
  if (minutes < 1) label = "Updated just now";
  else if (minutes === 1) label = "Updated 1 minute ago";
  else if (minutes < 60) label = `Updated ${minutes} minutes ago`;
  else {
    const hours = Math.round(minutes / 60);
    label = hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
  }

  return { minutes, label, stale: minutes >= staleAfterMinutes };
}

/** `in 45 minutes` / `25 minutes ago` — used by the precipitation countdown. */
export function relativeMinutes(
  instant: string | number | Date,
  now: number = Date.now(),
): string {
  const deltaMinutes = Math.round((toDate(instant).getTime() - now) / 60000);
  const magnitude = Math.abs(deltaMinutes);

  if (magnitude < 1) return "now";

  const spell = (): string => {
    if (magnitude < 60) return `${magnitude} minute${magnitude === 1 ? "" : "s"}`;
    const hours = Math.round(magnitude / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  };

  return deltaMinutes > 0 ? `in ${spell()}` : `${spell()} ago`;
}

/** `2 h 14 min` — daylight duration and similar spans. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
