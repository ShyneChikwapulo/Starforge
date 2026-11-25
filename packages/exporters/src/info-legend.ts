import { measureCardText } from './card-text';

/** A last line this short, with no space in it, is a widow: one stray word under a paragraph. */
const WIDOW_LENGTH = 8;

/**
 * When the last line of a wrapped legend is a lone short word, pulls the last word of the line
 * above down onto it (if the pair fits), so that a legend never ends on a bare "14.".
 */
export function avoidWidow(
  lines: string[],
  size: number,
  spacing: number,
  maxWidth: number,
): string[] {
  if (lines.length < 2) return lines;
  const last = lines[lines.length - 1]!;
  if (last.includes(' ') || last.length > WIDOW_LENGTH) return lines;
  const before = lines[lines.length - 2]!;
  const at = before.lastIndexOf(' ');
  if (at < 0) return lines;
  const moved = `${before.slice(at + 1)} ${last}`;
  if (measureCardText(moved, size, spacing) > maxWidth) return lines;
  return [...lines.slice(0, -2), before.slice(0, at), moved];
}
