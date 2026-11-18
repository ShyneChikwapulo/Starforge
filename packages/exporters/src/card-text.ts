import { CARD_FONT } from './card-font-data';
import { DISPLAY_FONT } from './display-font-data';

/**
 * Text for the cards, drawn as vector outlines. The letters are <use> references to glyph paths in
 * <defs>, so a card looks the same on every machine and needs no installed font. The card font has
 * no kerning: letters are spaced by their advance widths. Only the characters in the baked fonts
 * exist; any other is drawn, and measured, as a question mark.
 *
 * Two fonts are baked: the card font (Rajdhani) for everything, and a display font for big titles.
 * The display font has only capitals, so lowercase is drawn with them, and any character it lacks
 * is drawn with the card font's glyph instead. The two share one units-per-em, which is what makes
 * that mix possible.
 *
 * The display font is kerned to the shapes of its letters (see scripts/bake-display-font.ts):
 * between two of its own glyphs a pair's adjustment applies, and never across a fallback glyph.
 * With `lead`, the first letter of every word is drawn larger, as in a logo; a larger letter has
 * its own kerning table, because its shape is a different size from its neighbour's.
 */

const FALLBACK = '?';

/** Characters that end a word, so the next letter is the first of a new one. */
const SEPARATORS = new Set([' ', '-', '.', '_', '/']);

export type TextFont = 'card' | 'display';

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

interface Looked {
  char: string;
  id: string;
  advance: number;
  d: string;
  /** True for a glyph of the display font, the only kind that is kerned or drawn larger. */
  display: boolean;
}

interface Placed {
  glyph: Looked;
  /** Where the glyph's origin sits, in font units. */
  x: number;
  scale: number;
}

const idOf = (char: string): string => `g${char.codePointAt(0)}`;
const displayIdOf = (char: string): string => `d${char.codePointAt(0)}`;

function cardGlyph(char: string): Looked {
  const glyph = CARD_FONT.glyphs[char];
  if (glyph) return { char, id: idOf(char), display: false, ...glyph };
  return { char: FALLBACK, id: idOf(FALLBACK), display: false, ...CARD_FONT.glyphs[FALLBACK]! };
}

function lookup(char: string, font: TextFont): Looked {
  if (font === 'display') {
    const own = DISPLAY_FONT.glyphs[char] ? char : char.toUpperCase();
    const glyph = DISPLAY_FONT.glyphs[own];
    if (glyph) return { char: own, id: displayIdOf(own), display: true, ...glyph };
  }
  return cardGlyph(char);
}

/** How far to move `next` after `prev`, in font units: a display pair's kerning, else nothing. */
function kern(prev: Placed, next: Looked): number {
  if (!prev.glyph.display || !next.display) return 0;
  const table = prev.scale === 1 ? DISPLAY_FONT.kern : DISPLAY_FONT.kernLead;
  return table[prev.glyph.char + next.char] ?? 0;
}

/**
 * Lay `content` out in font units: where each glyph goes, and how wide the line is. `spacing` is
 * the extra space between letters, also in font units.
 */
function place(
  content: string,
  font: TextFont,
  lead: boolean,
  spacing: number,
): { placed: Placed[]; width: number } {
  const placed: Placed[] = [];
  let pen = 0;
  let startOfWord = true;
  for (const char of content) {
    const glyph = lookup(char, font);
    const scale = lead && glyph.display && startOfWord ? DISPLAY_FONT.leadScale : 1;
    const prev = placed[placed.length - 1];
    if (prev) pen += kern(prev, glyph);
    placed.push({ glyph, x: pen, scale });
    pen += glyph.advance * scale + spacing;
    startOfWord = SEPARATORS.has(char);
  }
  return { placed, width: placed.length > 0 ? pen - spacing : 0 };
}

/** How wide `content` is when drawn at `size`, with `spacing` between letters. */
export function measureCardText(
  content: string,
  size: number,
  spacing = 0,
  font: TextFont = 'card',
  lead = false,
): number {
  const scale = size / CARD_FONT.unitsPerEm;
  return place(content, font, lead, spacing / scale).width * scale;
}

/** The glyph outlines drawn so far, so only the letters a card uses end up in its <defs>. */
export class GlyphSet {
  private readonly paths = new Map<string, { char: string; d: string }>();

  add(char: string, d: string, id: string = idOf(char)): void {
    this.paths.set(id, { char, d });
  }

  definitions(): string {
    return [...this.paths]
      .sort(([idA, a], [idB, b]) => a.char.localeCompare(b.char) || idA.localeCompare(idB))
      .map(([id, glyph]) => `<path id="${id}" d="${glyph.d}"/>`)
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
  /** The font to draw with. Default: the card font. */
  font?: TextFont;
  /** Draw the first letter of every word larger. Only letters of the display font grow. */
  lead?: boolean;
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
  const { placed, width: units } = place(
    content,
    style.font ?? 'card',
    style.lead ?? false,
    spacing / scale,
  );
  const width = units * scale;
  const left = style.anchor === 'middle' ? x - width / 2 : style.anchor === 'end' ? x - width : x;

  const uses: string[] = [];
  for (const { glyph, x: pen, scale: grow } of placed) {
    if (!glyph.d) continue;
    set.add(glyph.char, glyph.d, glyph.id);
    if (grow !== 1) {
      uses.push(
        `<use href="#${glyph.id}" transform="translate(${Math.round(pen)} 0) scale(${grow})"/>`,
      );
    } else {
      uses.push(`<use href="#${glyph.id}"${pen === 0 ? '' : ` x="${Math.round(pen)}"`}/>`);
    }
  }

  const group =
    `<g aria-label="${escapeXml(content)}" fill="${style.fill}" ` +
    `transform="translate(${round(left)} ${round(y)}) scale(${scale.toFixed(5)})">${uses.join('')}</g>`;
  // The filter wraps the line from outside, so its blur is not scaled down with the letters.
  return style.filter ? `<g filter="url(#${style.filter})">${group}</g>` : group;
}
