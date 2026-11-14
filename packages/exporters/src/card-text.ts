import { CARD_FONT } from './card-font-data';

/**
 * Text for the profile card, drawn as vector outlines. The letters are <use> references to glyph
 * paths in <defs>, so the card looks the same on every machine and needs no installed font. There
 * is no kerning: letters are spaced by their advance widths. Only the characters in the baked font
 * exist; any other is drawn, and measured, as a question mark.
 */

const FALLBACK = '?';

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function lookup(char: string): { char: string; advance: number; d: string } {
  const glyph = CARD_FONT.glyphs[char];
  if (glyph) return { char, ...glyph };
  return { char: FALLBACK, ...CARD_FONT.glyphs[FALLBACK]! };
}

const idOf = (char: string): string => `g${char.codePointAt(0)}`;

/** How wide `content` is when drawn at `size`, with `spacing` between letters. */
export function measureCardText(content: string, size: number, spacing = 0): number {
  let advance = 0;
  let count = 0;
  for (const char of content) {
    advance += lookup(char).advance;
    count++;
  }
  return (advance * size) / CARD_FONT.unitsPerEm + spacing * Math.max(0, count - 1);
}

/** The glyph outlines drawn so far, so only the letters a card uses end up in its <defs>. */
export class GlyphSet {
  private readonly paths = new Map<string, string>();

  add(char: string, d: string): void {
    this.paths.set(char, d);
  }

  definitions(): string {
    return [...this.paths]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([char, d]) => `<path id="${idOf(char)}" d="${d}"/>`)
      .join('');
  }
}

export interface DrawTextStyle {
  size: number;
  fill: string;
  /** Extra space between letters, in the card's units. */
  spacing?: number;
  anchor?: 'start' | 'middle' | 'end';
  /** The id of a filter in the card's <defs>, applied to the whole line. */
  filter?: string;
}

const round = (value: number): number => Number(value.toFixed(2));

/** `content` is plain text: it is outlined, and escaped into the label. */
export function drawText(
  set: GlyphSet,
  x: number,
  y: number,
  content: string,
  style: DrawTextStyle,
): string {
  const spacing = style.spacing ?? 0;
  const scale = style.size / CARD_FONT.unitsPerEm;
  const width = measureCardText(content, style.size, spacing);
  const left = style.anchor === 'middle' ? x - width / 2 : style.anchor === 'end' ? x - width : x;

  const uses: string[] = [];
  let pen = 0;
  for (const char of content) {
    const glyph = lookup(char);
    if (glyph.d) {
      set.add(glyph.char, glyph.d);
      uses.push(`<use href="#${idOf(glyph.char)}"${pen === 0 ? '' : ` x="${Math.round(pen)}"`}/>`);
    }
    pen += glyph.advance + spacing / scale;
  }

  const group =
    `<g aria-label="${escapeXml(content)}" fill="${style.fill}" ` +
    `transform="translate(${round(left)} ${round(y)}) scale(${scale.toFixed(5)})">${uses.join('')}</g>`;
  // The filter wraps the line from outside, so its blur is not scaled down with the letters.
  return style.filter ? `<g filter="url(#${style.filter})">${group}</g>` : group;
}
