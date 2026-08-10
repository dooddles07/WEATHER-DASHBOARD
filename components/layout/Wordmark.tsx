import { cn } from "@/lib/utils/cn";
import { temperatureColor } from "@/lib/weather/scales";

/**
 * The ISOBAR mark.
 *
 * An isobar is the contour that defines a synoptic chart — the line joining
 * points of equal pressure — so the mark is a set of nested contours. Their
 * tint is sampled from the temperature ramp at the current reading of the
 * place being viewed, which makes the identity a live instrument rather than a
 * fixed logo: warm in Dubai, cold in Reykjavík, and shifting through the day.
 *
 * With no reading available it falls back to the achromatic shell colour,
 * because an invented temperature would be a lie told in the logo.
 */
export function Wordmark({
  temperature,
  className,
  showText = true,
}: {
  temperature?: number;
  className?: string;
  showText?: boolean;
}) {
  const hasReading = temperature !== undefined && Number.isFinite(temperature);

  // Three contours a few degrees apart, exactly as a pressure chart steps.
  const contours = hasReading
    ? [temperature - 6, temperature, temperature + 6].map(temperatureColor)
    : ["currentColor", "currentColor", "currentColor"];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 28 28"
        width={26}
        height={26}
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <path
          d="M14 4.6c5.1 0 9.1 4.1 9.1 9.4S19.1 23.4 14 23.4 4.9 19.3 4.9 14 8.9 4.6 14 4.6Z"
          stroke={contours[0]}
          opacity={hasReading ? 0.55 : 0.35}
        />
        <path
          d="M14 8c3.2.4 6 3 5.8 6.3-.2 3.4-2.9 5.9-6.2 5.7-3.2-.2-5.7-2.9-5.5-6.2C8.3 10.6 10.9 8.2 14 8Z"
          stroke={contours[1]}
          opacity={hasReading ? 0.85 : 0.6}
        />
        <path
          d="M14.2 11.6c1.5.2 2.6 1.5 2.5 2.9-.1 1.5-1.4 2.6-2.9 2.5-1.4-.1-2.5-1.4-2.4-2.8.1-1.5 1.4-2.6 2.8-2.6Z"
          stroke={contours[2]}
        />
      </svg>

      {showText ? (
        <span
          className="text-sm font-semibold tracking-[0.14em]"
          style={{ fontVariationSettings: '"wdth" 112' }}
        >
          ISOBAR
        </span>
      ) : null}
    </span>
  );
}
