import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderLegendSvg } from './legend';

const metrics = createSampleMetrics();

describe('legend themes', () => {
  it('keeps the dark card and light text by default', () => {
    const svg = renderLegendSvg(metrics);
    expect(svg).toContain('<rect');
    expect(svg).toContain('#05080f');
    expect(svg).toContain('#c9d1d9');
  });

  it('draws no card when the background is null', () => {
    expect(renderLegendSvg(metrics, { background: null })).not.toContain('<rect');
  });

  it('uses dark text and no card on the light theme', () => {
    const svg = renderLegendSvg(metrics, { theme: 'light' });
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('#24292f');
    expect(svg).not.toContain('#c9d1d9');
    expect(svg).not.toContain('#f0f6fc');
  });

  it('lets a light legend have a card of its own', () => {
    expect(renderLegendSvg(metrics, { theme: 'light', background: '#ffffff' })).toContain(
      'fill="#ffffff"',
    );
  });
});
