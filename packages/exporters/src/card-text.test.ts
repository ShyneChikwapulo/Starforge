import { describe, expect, it } from 'vitest';
import { CARD_FONT } from './card-font-data';
import { GlyphSet, drawText, escapeXml, measureCardText } from './card-text';

describe('measureCardText', () => {
  it('is zero for no text', () => {
    expect(measureCardText('', 20)).toBe(0);
  });

  it('grows in proportion to size', () => {
    expect(measureCardText('STARFORGE', 20)).toBeCloseTo(measureCardText('STARFORGE', 10) * 2, 6);
  });

  it('adds spacing between letters only', () => {
    expect(measureCardText('ABC', 10, 2) - measureCardText('ABC', 10)).toBeCloseTo(4, 6);
  });

  it('measures a character the font lacks as a question mark', () => {
    expect(measureCardText('€', 10)).toBeCloseTo(measureCardText('?', 10), 6);
  });

  it('has every character the card draws', () => {
    for (const char of 'ABCXYZ 0123456789%·—…<?:@') {
      expect(CARD_FONT.glyphs[char], char).toBeDefined();
    }
  });
});

describe('drawText', () => {
  it('draws each letter as a reference to a shared outline', () => {
    const set = new GlyphSet();
    const svg = drawText(set, 10, 20, 'AA', { size: 20, fill: '#fff' });
    expect(svg.match(/<use /g)).toHaveLength(2);
    expect(svg).toContain('aria-label="AA"');
    expect(set.definitions().match(/<path id="g65"/g)).toHaveLength(1);
  });

  it('draws a space as nothing, but still moves along', () => {
    const set = new GlyphSet();
    expect(drawText(set, 0, 0, ' ', { size: 20, fill: '#fff' })).not.toContain('<use');
    expect(measureCardText('A A', 20)).toBeGreaterThan(measureCardText('AA', 20));
  });

  it('places the line from its start, middle or end', () => {
    const width = measureCardText('ABC', 20);
    const at = (anchor: 'start' | 'middle' | 'end'): string =>
      drawText(new GlyphSet(), 100, 50, 'ABC', { size: 20, fill: '#fff', anchor });
    expect(at('start')).toContain('translate(100 50)');
    expect(at('middle')).toContain(`translate(${Number((100 - width / 2).toFixed(2))} 50)`);
    expect(at('end')).toContain(`translate(${Number((100 - width).toFixed(2))} 50)`);
  });

  it('puts a filter around the line, not on the scaled letters', () => {
    const svg = drawText(new GlyphSet(), 0, 0, 'A', { size: 20, fill: '#fff', filter: 'glow' });
    expect(svg.startsWith('<g filter="url(#glow)"><g ')).toBe(true);
  });

  it('escapes the label', () => {
    const svg = drawText(new GlyphSet(), 0, 0, '<&"', { size: 20, fill: '#fff' });
    expect(svg).toContain('aria-label="&lt;&amp;&quot;"');
  });
});

describe('escapeXml', () => {
  it('escapes the five XML characters', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });
});
