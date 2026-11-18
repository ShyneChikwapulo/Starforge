import { describe, expect, it } from 'vitest';
import { GlyphSet, drawText, measureCardText } from './card-text';
import { DISPLAY_FONT } from './display-font-data';

const SIZE = DISPLAY_FONT.unitsPerEm;
const lead = DISPLAY_FONT.leadScale;
const grown = (svg: string): number => (svg.match(/scale\(1\.\d+\)\"\/>/g) ?? []).length;
const draw = (text: string, withLead = true): string =>
  drawText(new GlyphSet(), 0, 0, text, {
    size: SIZE,
    fill: '#fff',
    font: 'display',
    lead: withLead,
  });

describe('the first letter of a word', () => {
  it('is larger than the others', () => {
    expect(lead).toBeGreaterThan(1);
    expect(measureCardText('AB', SIZE, 0, 'display', true)).toBeGreaterThan(
      measureCardText('AB', SIZE, 0, 'display', false),
    );
  });

  it('is measured exactly, with its own kerning to the next letter', () => {
    const adjust = DISPLAY_FONT.kernLead['AB'] ?? 0;
    expect(measureCardText('AB', SIZE, 0, 'display', true)).toBeCloseTo(
      DISPLAY_FONT.glyphs['A']!.advance * lead + adjust + DISPLAY_FONT.glyphs['B']!.advance,
      6,
    );
  });

  it('applies to the first letter of every word', () => {
    expect(grown(draw('AB CD'))).toBe(2);
    expect(grown(draw('AB CD EF'))).toBe(3);
  });

  it('starts a new word after a hyphen, a period or a slash', () => {
    expect(grown(draw('MARY-JANE'))).toBe(2);
    expect(grown(draw('J.R.R.'))).toBe(3);
    expect(grown(draw('A/B'))).toBe(2);
  });

  it('is not an initial after a digit or a letter', () => {
    expect(grown(draw('1ST'))).toBe(0);
    expect(grown(draw('ABC'))).toBe(1);
  });

  it('is off unless asked', () => {
    expect(grown(draw('AB CD', false))).toBe(0);
  });

  it('never grows a fallback glyph, such as a digit', () => {
    expect(grown(draw('1'))).toBe(0);
  });

  it('copes with spaces at either end and between words', () => {
    expect(grown(draw('  AB   CD  '))).toBe(2);
    expect(grown(draw(''))).toBe(0);
    expect(measureCardText('', SIZE, 0, 'display', true)).toBe(0);
  });
});
