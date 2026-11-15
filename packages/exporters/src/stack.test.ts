import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderHeroSvg } from './hero';
import { renderPresetCardSvg } from './preset-card';

const metrics = createSampleMetrics();
const preset = { id: 'galaxy', name: 'Galaxy', caption: 'Arms: languages' };
const media = { href: 'data:image/webp;base64,AAAA', width: 480, height: 240 };
const CLOSED_FRAME = /<path d="M56,12 L1188,12[^"]*" fill="none" stroke=/;
const heightOf = (svg: string): number => Number(/viewBox="0 0 1200 (\d+)"/.exec(svg)![1]);

describe('the hero card as a piece of a stack', () => {
  it('is a standalone card with a closed frame by default', () => {
    const svg = renderHeroSvg(metrics);
    expect(svg).toMatch(CLOSED_FRAME);
    expect(svg).not.toContain('id="edgeL"');
  });

  it('swaps the closed frame for the page chrome, and keeps its height', () => {
    const alone = renderHeroSvg(metrics);
    const stacked = renderHeroSvg(metrics, { stack: 'top' });
    expect(stacked).not.toMatch(CLOSED_FRAME);
    expect(stacked).toContain('id="edgeL"');
    expect(stacked).toContain('class="rail-pulse"');
    expect(heightOf(stacked)).toBe(heightOf(alone));
  });
});

describe('a preset card as a piece of a stack', () => {
  it('is a standalone card with a closed frame by default', () => {
    const svg = renderPresetCardSvg(metrics, { preset, media });
    expect(svg).toMatch(CLOSED_FRAME);
    expect(svg).not.toContain('id="edgeL"');
  });

  it('swaps the closed frame for the page chrome, and keeps its height', () => {
    const alone = renderPresetCardSvg(metrics, { preset, media });
    const stacked = renderPresetCardSvg(metrics, { preset, media, stack: 'none' });
    expect(stacked).not.toMatch(CLOSED_FRAME);
    expect(stacked).toContain('id="edgeL"');
    expect(stacked).not.toContain('class="rail-pulse"');
    expect(heightOf(stacked)).toBe(heightOf(alone));
  });
});
