import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderCardSvg } from './index';
import { INFO_CARD_IDS, renderInfoCardSvg } from './info-card';
import { SKIN_NAMES, SUNSET, contrastRatio, resolveSkin } from './skin';

const base = createSampleMetrics();

describe('the sunset skin', () => {
  it('is a named skin', () => {
    expect(SKIN_NAMES).toContain('sunset');
    expect(resolveSkin('sunset')).toBe(SUNSET);
  });

  it('keeps its text readable on its background', () => {
    const { bg, text, soft, muted, accent } = SUNSET.colors;
    expect(contrastRatio(text, bg)).toBeGreaterThan(10);
    expect(contrastRatio(soft, bg)).toBeGreaterThan(7);
    expect(contrastRatio(muted, bg)).toBeGreaterThan(4.5);
    expect(contrastRatio(accent, bg)).toBeGreaterThan(7);
  });

  it('has a heat ramp that brightens step by step and stays apart from an empty cell', () => {
    const heat = SUNSET.heat!;
    expect(heat).toHaveLength(4);
    const brightness = heat.map((colour) => contrastRatio(colour, '#000000'));
    expect([...brightness].sort((a, b) => a - b)).toEqual(brightness);
    expect(contrastRatio(heat[0], SUNSET.tracks)).toBeGreaterThan(1.4);
  });

  it.each(INFO_CARD_IDS)('draws the %s card without a colour from another skin', (card) => {
    const svg = renderInfoCardSvg(base, { card, skin: 'sunset' });
    expect(svg).not.toContain('#fcee09');
    expect(svg).not.toContain('#3fb950');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
  });

  it('draws the profile card without a colour from another skin', () => {
    const svg = renderCardSvg(base, { skin: 'sunset' });
    expect(svg).not.toContain('#fcee09');
    expect(svg).not.toContain('#3fb950');
  });

  it('colours the heatmap from its ramp, and leaves the other skins on the accent', () => {
    const sunset = renderInfoCardSvg(base, { card: 'heatmap', skin: 'sunset' });
    for (const colour of SUNSET.heat!) expect(sunset).toContain(colour);
    for (const skin of ['cyberpunk', 'default'] as const) {
      const svg = renderInfoCardSvg(base, { card: 'heatmap', skin });
      for (const colour of SUNSET.heat!) expect(svg).not.toContain(colour);
    }
  });
});
