import { cn } from "@/lib/utils/cn";

/**
 * The weather glyph set.
 *
 * General icon packs carry three or four weather symbols, which is not enough
 * to tell freezing drizzle from snow grains — a distinction that changes
 * whether you can safely drive. So the set is drawn here, compositionally: a
 * handful of primitives on a 24-unit grid, combined per condition.
 *
 * Everything is stroked in `currentColor` at a constant weight, so a glyph sits
 * beside text at any size without looking heavier or lighter than the words.
 */

const STROKE = 1.5;

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** Eight rays and a disc, offset up-left when a cloud sits in front. */
function Sun({ cx = 12, cy = 12, r = 4 }: { cx?: number; cy?: number; r?: number }) {
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const from = r + 2;
    const to = r + 4.2;
    return (
      <line
        key={index}
        x1={cx + Math.cos(angle) * from}
        y1={cy + Math.sin(angle) * from}
        x2={cx + Math.cos(angle) * to}
        y2={cy + Math.sin(angle) * to}
      />
    );
  });

  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      {rays}
    </>
  );
}

/** A waxing crescent, cut with a second arc rather than a mask. */
function Moon({ cx = 12, cy = 12, r = 5 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <path
      d={`M ${cx + r * 0.55} ${cy - r * 0.83}
          a ${r} ${r} 0 1 0 ${r * 0.72} ${r * 1.5}
          a ${r * 0.82} ${r * 0.82} 0 1 1 ${-r * 0.72} ${-r * 1.5} Z`}
    />
  );
}

/** The standard cumulus outline every cloudy state is built from. */
function Cloud({ y = 0, scale = 1 }: { y?: number; scale?: number }) {
  return (
    <path
      transform={`translate(12 ${12 + y}) scale(${scale}) translate(-12 -12)`}
      d="M7.4 18.5a4.4 4.4 0 0 1-.5-8.77 5.6 5.6 0 0 1 10.75-1.4 3.95 3.95 0 0 1-.35 10.17Z"
    />
  );
}

/** Short angled strokes. `count` sets the density, which encodes intensity. */
function Rain({ count = 3, y = 19 }: { count?: number; y?: number }) {
  const positions = { 1: [12], 2: [9.5, 14.5], 3: [8, 12, 16], 4: [7, 10.4, 13.6, 17] }[
    count as 1 | 2 | 3 | 4
  ] ?? [8, 12, 16];

  return (
    <>
      {positions.map((x) => (
        <line key={x} x1={x} y1={y} x2={x - 1.4} y2={y + 3.2} />
      ))}
    </>
  );
}

/** Six-armed asterisks, drawn small so they read as flakes not stars. */
function Snow({ count = 3, y = 20 }: { count?: number; y?: number }) {
  const positions = { 2: [9.5, 14.5], 3: [8, 12, 16] }[count as 2 | 3] ?? [8, 12, 16];
  const arm = 1.5;

  return (
    <>
      {positions.map((x) => (
        <g key={x}>
          <line x1={x - arm} y1={y} x2={x + arm} y2={y} />
          <line x1={x - arm / 2} y1={y - arm * 0.87} x2={x + arm / 2} y2={y + arm * 0.87} />
          <line x1={x - arm / 2} y1={y + arm * 0.87} x2={x + arm / 2} y2={y - arm * 0.87} />
        </g>
      ))}
    </>
  );
}

/** The one filled shape in the set — a bolt reads as solid or not at all. */
function Bolt({ x = 12, y = 18 }: { x?: number; y?: number }) {
  return (
    <path
      fill="currentColor"
      stroke="none"
      d={`M ${x + 1.2} ${y} h 2.6 l -4.6 5.8 l 1.1 -3.7 h -2.4 l 3.4 -4.6 Z`}
    />
  );
}

/** Small circles for hail, paired with the bolt on the hail conditions. */
function Hail({ y = 21 }: { y?: number }) {
  return (
    <>
      <circle cx={8} cy={y} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={16.2} cy={y} r={0.9} fill="currentColor" stroke="none" />
    </>
  );
}

/** Staggered horizontal rules, the conventional symbol for reduced visibility. */
function FogLines() {
  return (
    <>
      <line x1={4} y1={9} x2={19} y2={9} />
      <line x1={6} y1={13} x2={21} y2={13} />
      <line x1={3.5} y1={17} x2={17} y2={17} />
      <line x1={7} y1={21} x2={20} y2={21} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Compositions                                                               */
/* -------------------------------------------------------------------------- */

const GLYPHS: Record<string, () => React.ReactElement> = {
  clear: () => <Sun r={4.4} />,
  "clear-night": () => <Moon r={5.4} />,

  "mostly-clear": () => (
    <>
      <Sun cx={9} cy={9} r={3.2} />
      <Cloud y={2.6} scale={0.82} />
    </>
  ),
  "mostly-clear-night": () => (
    <>
      <Moon cx={9.5} cy={8.5} r={4} />
      <Cloud y={2.6} scale={0.82} />
    </>
  ),

  "partly-cloudy": () => (
    <>
      <Sun cx={8} cy={8} r={2.9} />
      <Cloud y={3} scale={0.92} />
    </>
  ),
  "partly-cloudy-night": () => (
    <>
      <Moon cx={8.8} cy={8} r={3.8} />
      <Cloud y={3} scale={0.92} />
    </>
  ),

  overcast: () => (
    <>
      <path d="M6.2 9.2a5 5 0 0 1 9.2-1.5" opacity={0.55} />
      <Cloud y={2.4} />
    </>
  ),

  fog: () => <FogLines />,

  drizzle: () => (
    <>
      <Cloud y={-2} scale={0.92} />
      <Rain count={2} y={18} />
    </>
  ),
  "rain-light": () => (
    <>
      <Cloud y={-2} scale={0.92} />
      <Rain count={2} y={18} />
    </>
  ),
  rain: () => (
    <>
      <Cloud y={-2} scale={0.92} />
      <Rain count={3} y={18} />
    </>
  ),
  "rain-heavy": () => (
    <>
      <Cloud y={-2.4} scale={0.92} />
      <Rain count={4} y={17.6} />
    </>
  ),
  "freezing-rain": () => (
    <>
      <Cloud y={-2.4} scale={0.9} />
      <Rain count={2} y={17.6} />
      <Snow count={2} y={22} />
    </>
  ),

  "snow-light": () => (
    <>
      <Cloud y={-2} scale={0.92} />
      <Snow count={2} y={19.5} />
    </>
  ),
  snow: () => (
    <>
      <Cloud y={-2} scale={0.92} />
      <Snow count={3} y={19.5} />
    </>
  ),
  "snow-heavy": () => (
    <>
      <Cloud y={-3} scale={0.9} />
      <Snow count={3} y={18} />
      <Snow count={2} y={21.8} />
    </>
  ),

  showers: () => (
    <>
      <Sun cx={7.6} cy={7} r={2.5} />
      <Cloud y={0.4} scale={0.88} />
      <Rain count={2} y={19.4} />
    </>
  ),
  "showers-night": () => (
    <>
      <Moon cx={8.4} cy={7} r={3.4} />
      <Cloud y={0.4} scale={0.88} />
      <Rain count={2} y={19.4} />
    </>
  ),
  "showers-heavy": () => (
    <>
      <Sun cx={7.6} cy={6.6} r={2.4} />
      <Cloud y={0.2} scale={0.88} />
      <Rain count={3} y={19.2} />
    </>
  ),
  "showers-heavy-night": () => (
    <>
      <Moon cx={8.4} cy={6.8} r={3.3} />
      <Cloud y={0.2} scale={0.88} />
      <Rain count={3} y={19.2} />
    </>
  ),

  "snow-showers": () => (
    <>
      <Sun cx={7.6} cy={7} r={2.5} />
      <Cloud y={0.4} scale={0.88} />
      <Snow count={2} y={20.4} />
    </>
  ),
  "snow-showers-night": () => (
    <>
      <Moon cx={8.4} cy={7} r={3.4} />
      <Cloud y={0.4} scale={0.88} />
      <Snow count={2} y={20.4} />
    </>
  ),

  thunderstorm: () => (
    <>
      <Cloud y={-2.6} scale={0.92} />
      <Bolt x={11} y={17.2} />
    </>
  ),
  "thunderstorm-hail": () => (
    <>
      <Cloud y={-3.2} scale={0.9} />
      <Bolt x={11} y={16.4} />
      <Hail y={21.4} />
    </>
  ),

  // Shown when a provider omits the condition code entirely. A question mark
  // is more honest than guessing at "clear".
  unknown: () => (
    <>
      <circle cx={12} cy={12} r={8} opacity={0.4} />
      <path d="M9.8 9.9a2.3 2.3 0 1 1 3 2.2v1.3" />
      <line x1={12.8} y1={16.3} x2={12.8} y2={16.4} />
    </>
  ),
};

export interface WeatherGlyphProps {
  /** Key from `glyphFor(condition, isDay)`. */
  glyph: string;
  size?: number;
  className?: string;
  /**
   * Glyphs sit next to their own text label almost everywhere, so they default
   * to decorative. Pass a label only where the glyph stands alone.
   */
  label?: string;
}

export function WeatherGlyph({ glyph, size = 24, className, label }: WeatherGlyphProps) {
  const draw = GLYPHS[glyph] ?? GLYPHS.unknown;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {draw()}
    </svg>
  );
}
