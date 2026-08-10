import { AlertOctagon, AlertTriangle, Ban, Eye, Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { SEVERITY, type SeverityLevel } from "@/lib/weather/scales";

/**
 * A severity badge that does not rely on colour.
 *
 * Three redundant channels: a distinct icon per level, a fill pattern that
 * intensifies with severity, and the level written out. Any one of them is
 * enough to tell a Warning from an Advisory, which is what makes this usable
 * in greyscale, with colour blindness, or on a bad screen in bright sun.
 */

const ICONS: Record<SeverityLevel, typeof Info> = {
  information: Info,
  advisory: Eye,
  watch: AlertTriangle,
  warning: AlertOctagon,
  emergency: Ban,
};

/** Diagonal hatching, at two densities, for the middle and upper levels. */
function Hatch({ id, dense }: { id: string; dense: boolean }) {
  const step = dense ? 3 : 5;
  return (
    <pattern
      id={id}
      width={step}
      height={step}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={step} height={step} fill="currentColor" opacity={0.22} />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={step}
        stroke="currentColor"
        strokeWidth={dense ? 1.6 : 1.1}
      />
    </pattern>
  );
}

export function SeverityMark({
  severity,
  className,
  showLabel = false,
}: {
  severity: SeverityLevel;
  className?: string;
  showLabel?: boolean;
}) {
  const style = SEVERITY[severity];
  const Icon = ICONS[severity];
  const patternId = `severity-${severity}`;
  const hatched = style.pattern === "hatch" || style.pattern === "hatch-dense";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm"
        style={{ color: style.color }}
      >
        {hatched ? (
          <svg className="absolute inset-0 size-full" aria-hidden>
            <defs>
              <Hatch id={patternId} dense={style.pattern === "hatch-dense"} />
            </defs>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </svg>
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundColor: style.color,
              opacity: style.pattern === "solid" ? 1 : 0.18,
            }}
          />
        )}

        <Icon
          className="relative size-4"
          style={{ color: style.pattern === "solid" ? style.on : style.color }}
          aria-hidden
        />
      </span>

      {showLabel ? (
        <span className="text-xs font-medium uppercase tracking-wider">
          {style.label}
        </span>
      ) : (
        <span className="sr-only">{style.label}</span>
      )}
    </span>
  );
}
