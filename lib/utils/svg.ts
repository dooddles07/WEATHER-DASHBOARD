/**
 * Rounds a coordinate for SVG output.
 *
 * Two decimals is far finer than a pixel, and rounding matters for more than
 * tidiness: an unrounded double can serialise with a different number of
 * significant digits on the server than in the browser, which React reports as
 * a hydration mismatch. Rounding removes the class of bug entirely.
 */
export const px = (value: number): number => Math.round(value * 100) / 100;
