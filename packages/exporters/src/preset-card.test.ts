import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { captionSegments, renderPresetCardSvg } from './preset-card';

const metrics = createSampleMetrics();
const preset = {
  id: 'galaxy',
  name: 'Galaxy',
  caption: 'Arms: languages · Stars: repositories, sized by stars',
};
const wide = { href: 'data:image/webp;base64,AAAA', width: 480, height: 240 };
const square = { href: 'data:image/webp;base64,AAAA', width: 480, height: 480 };

const heightOf = (svg: string): number => Number(/viewBox="0 0 1200 (\d+)"/.exec(svg)![1]);

describe('captionSegments', () => {
  it('splits a caption into keys and meanings, in capitals', () => {
    expect(captionSegments(preset.caption)).toEqual([
      { key: 'ARMS', meaning: 'LANGUAGES' },
      { key: 'STARS', meaning: 'REPOSITORIES, SIZED BY STARS' },
    ]);
  });

  it('keeps a segment with no key as a meaning only', () => {
    expect(captionSegments('Just words')).toEqual([{ key: '', meaning: 'JUST WORDS' }]);
  });
});

describe('renderPresetCardSvg', () => {
  it('is a standalone SVG that embeds the animation', () => {
    const svg = renderPresetCardSvg(metrics, { preset, media: wide });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('href="data:image/webp;base64,AAAA"');
    expect(svg).not.toContain('<text');
  });

  it('is exactly as tall as a multiple of 60 units, for either layout', () => {
    expect(heightOf(renderPresetCardSvg(metrics, { preset, media: wide })) % 60).toBe(0);
    expect(heightOf(renderPresetCardSvg(metrics, { preset, media: square })) % 60).toBe(0);
  });

  it('puts the legend under wide media and beside square media', () => {
    const under = renderPresetCardSvg(metrics, { preset, media: wide });
    const beside = renderPresetCardSvg(metrics, { preset, media: square });
    expect(under).toContain('aria-label="ACTIVITY · 12 WEEKS"');
    expect(beside).toContain('aria-label="ENCODING"');
    expect(under).not.toContain('aria-label="ENCODING"');
  });

  it('can be forced into a layout', () => {
    const svg = renderPresetCardSvg(metrics, { preset, media: wide, layout: 'side' });
    expect(svg).toContain('aria-label="ENCODING"');
  });

  it('draws the legend from the caption, and the languages from the data', () => {
    const svg = renderPresetCardSvg(metrics, { preset, media: wide });
    expect(svg).toContain('aria-label="ARMS"');
    expect(svg).toContain('aria-label="REPOSITORIES, SIZED BY STARS"');
    expect(svg).toContain(`aria-label="${metrics.languages[0]!.name.toUpperCase()}"`);
  });

  it('keeps to characters the font has, so no question marks appear', () => {
    const svg = renderPresetCardSvg(metrics, {
      preset: { ...preset, name: 'Café ✓' },
      media: wide,
    });
    expect(svg).toContain('aria-label="CAFE "');
    expect(svg).not.toContain('aria-label="?"');
  });

  it('scales to a requested width and keeps its shape', () => {
    const svg = renderPresetCardSvg(metrics, { preset, media: wide, width: 600 });
    expect(svg).toContain('width="600"');
    expect(svg).toContain(`height="${Math.round((600 * heightOf(svg)) / 1200)}"`);
  });

  it('copes with no languages', () => {
    const first = metrics.languages[0]!.name.toUpperCase();
    const svg = renderPresetCardSvg({ ...metrics, languages: [] }, { preset, media: wide });
    expect(svg).not.toContain(`aria-label="${first}"`);
    const side = renderPresetCardSvg({ ...metrics, languages: [] }, { preset, media: square });
    expect(side).not.toContain(`aria-label="${first}"`);
  });

  it('is deterministic', () => {
    const a = renderPresetCardSvg(metrics, { preset, media: wide });
    expect(renderPresetCardSvg(metrics, { preset, media: wide })).toBe(a);
  });
});
