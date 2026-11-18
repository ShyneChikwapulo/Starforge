import { describe, expect, it } from 'vitest';
import { CARD_FONT } from './card-font-data';
import { GlyphSet, drawText, measureCardText } from './card-text';
import { DISPLAY_FONT } from './display-font-data';

/** At a size equal to units per em, one card unit is one font unit, so the sums are exact. */
const SIZE = DISPLAY_FONT.unitsPerEm;

describe('the display font kerning', () => {
  it('has adjustments for many pairs of capitals', () => {
    expect(Object.keys(DISPLAY_FONT.kern).length).toBeGreaterThan(100);
  });

  it('has pairs that tuck together', () => {
    expect(Object.values(DISPLAY_FONT.kern).some((value) => value < 0)).toBe(true);
  });

  it('applies a pair’s adjustment when measuring', () => {
    const [pair, adjust] = Object.entries(DISPLAY_FONT.kern).find(([, value]) => value !== 0)!;
    const [a, b] = [pair[0]!, pair[1]!];
    expect(measureCardText(pair, SIZE, 0, 'display')).toBe(
      DISPLAY_FONT.glyphs[a]!.advance + DISPLAY_FONT.glyphs[b]!.advance + adjust,
    );
  });

  it('moves the second letter of a pair when drawing', () => {
    const [pair, adjust] = Object.entries(DISPLAY_FONT.kern).find(([, value]) => value !== 0)!;
    const first = DISPLAY_FONT.glyphs[pair[0]!]!.advance;
    const svg = drawText(new GlyphSet(), 0, 0, pair, { size: SIZE, fill: '#fff', font: 'display' });
    expect(svg).toContain(`x="${Math.round(first + adjust)}"`);
  });

  it('never kerns across a fallback glyph', () => {
    expect(measureCardText('A1', SIZE, 0, 'display')).toBe(
      DISPLAY_FONT.glyphs['A']!.advance + CARD_FONT.glyphs['1']!.advance,
    );
  });

  it('does not kern the card font', () => {
    expect(measureCardText('AB', SIZE)).toBe(
      CARD_FONT.glyphs['A']!.advance + CARD_FONT.glyphs['B']!.advance,
    );
  });
});
