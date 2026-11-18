import { describe, expect, it } from 'vitest';
import { CARD_FONT } from './card-font-data';
import { GlyphSet, drawText, measureCardText } from './card-text';
import { DISPLAY_FONT } from './display-font-data';

describe('the display font', () => {
  it('has the same units per em as the card font, which the fallback glyphs rely on', () => {
    expect(DISPLAY_FONT.unitsPerEm).toBe(CARD_FONT.unitsPerEm);
  });

  it('covers every capital', () => {
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(DISPLAY_FONT.glyphs[char]?.d, char).toBeTruthy();
    }
  });

  it('draws lowercase with the capital glyphs', () => {
    expect(measureCardText('a', 40, 0, 'display')).toBe(measureCardText('A', 40, 0, 'display'));
  });

  it('measures differently from the card font', () => {
    expect(measureCardText('SHINE', 40, 0, 'display')).not.toBe(measureCardText('SHINE', 40));
  });

  it('falls back to the card font for characters it lacks, such as digits', () => {
    const set = new GlyphSet();
    const svg = drawText(set, 0, 0, 'A1', { size: 40, fill: '#fff', font: 'display' });
    expect(svg).toContain('href="#d65"');
    expect(svg).toContain('href="#g49"');
    const defs = set.definitions();
    expect(defs).toContain('id="d65"');
    expect(defs).toContain('id="g49"');
  });

  it('keeps the two fonts apart when the same letter is drawn in each', () => {
    const set = new GlyphSet();
    drawText(set, 0, 0, 'A', { size: 40, fill: '#fff', font: 'display' });
    drawText(set, 0, 0, 'A', { size: 40, fill: '#fff' });
    const defs = set.definitions();
    expect(defs).toContain('id="d65"');
    expect(defs).toContain('id="g65"');
  });

  it('draws with the card font unless asked', () => {
    const set = new GlyphSet();
    const svg = drawText(set, 0, 0, 'A', { size: 40, fill: '#fff' });
    expect(svg).toContain('href="#g65"');
    expect(svg).not.toContain('#d65');
  });
});
