/**
 * Shared pieces of the neon HUD look: chamfered panels and number formatting. The
 * profile card, the hero card and the preset cards are all drawn from these.
 */

export interface Cuts {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
}

/** A rectangle with any of its corners cut off at 45 degrees. */
export function panel(x: number, y: number, w: number, h: number, cuts: Cuts = {}): string {
  const { tl = 0, tr = 0, br = 0, bl = 0 } = cuts;
  return (
    `M${x + tl},${y} L${x + w - tr},${y} L${x + w},${y + tr} L${x + w},${y + h - br} ` +
    `L${x + w - br},${y + h} L${x + bl},${y + h} L${x},${y + h - bl} L${x},${y + tl} Z`
  );
}

export const formatNumber = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const plural = (count: number, one: string, many: string): string =>
  count === 1 ? one : many;

/** `value` cut to at most `max` characters, ending in an ellipsis when it was longer. */
export const fit = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
