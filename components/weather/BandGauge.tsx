import { Label } from "@/components/ui/primitives";
import type { Band } from "@/lib/weather/scales";
import { bandFor } from "@/lib/weather/scales";

/**
 * A reading against its published category scale.
 *
 * Used for UV and air quality, both of which are meaningless as bare numbers —
 * 8 is dangerous on one scale and unremarkable on another. The bar shows where
 * the value sits among the official bands, and the band name is always spelled
 * out, so the categories survive greyscale, colour blindness and a printed page.
 */

export function BandGauge({
  value,
  bands,
  max,
  label,
  caption,
  spokenUnit,
}: {
  value: number;
  bands: readonly Band[];
  /** Top of the visible scale; readings above it clamp to the end. */
  max: number;
  label: string;
  caption?: string;
  spokenUnit: string;
}) {
  const band = bandFor(bands, value);
  const position = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="readout text-2xl">{Math.round(value)}</span>
          <span className="text-sm font-medium">{band.label}</span>
        </div>
        <Label>{label}</Label>
      </div>

      <div
        role="img"
        aria-label={`${label}: ${Math.round(value)} ${spokenUnit}, in the ${band.label} band.`}
        className="relative"
      >
        <div className="flex h-2 gap-px overflow-hidden rounded-full">
          {bands.map((entry) => {
            const from = Math.max(0, entry.min);
            const to = Math.min(max, entry.max === Number.POSITIVE_INFINITY ? max : entry.max);
            const width = Math.max(0, ((to - from) / max) * 100);
            if (width <= 0) return null;
            return (
              <span
                key={entry.label}
                style={{ width: `${width}%`, backgroundColor: entry.color }}
                // The bar is decorative; the label above carries the meaning.
                aria-hidden
              />
            );
          })}
        </div>

        <span
          aria-hidden
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-panel"
          style={{ left: `${position}%` }}
        />
      </div>

      {caption ? (
        <p className="text-xs leading-relaxed text-tertiary">{caption}</p>
      ) : null}
    </div>
  );
}
