import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { chromeLayer } from './chrome';
import { layoutPlainName, renderHeroSvg } from './hero';
import { renderFooterSvg, renderSectionSvg } from './page-pieces';
import { renderPresetCardSvg } from './preset-card';
import { createDefaultSkin } from './skin';

const metrics = createSampleMetrics();
const skin = createDefaultSkin();
const preset = { id: 'galaxy', name: 'Galaxy', caption: 'Arms: languages · Stars: repositories' };
const wide = { href: 'data:image/webp;base64,AAAA', width: 480, height: 240 };
const square = { href: 'data:image/webp;base64,AAAA', width: 480, height: 480 };

const NEON_MARKS = [
  'class="pulse"',
  'class="glitch"',
  'class="spin-a"',
  'class="live"',
  'url(#glow)',
  'url(#scan)',
  'url(#vignette)',
  'url(#glowTR)',
  'url(#rowActive)',
  '#fcee09',
  '#2ee6ff',
];

const calm = (label: string, svg: string): void => {
  for (const mark of NEON_MARKS)
    expect(svg, `${label} should not contain ${mark}`).not.toContain(mark);
  expect(svg.startsWith('<svg'), label).toBe(true);
  expect(svg, label).not.toContain('NaN');
  expect(svg, label).not.toContain('undefined');
};

describe('the default skin, on every card', () => {
  it('draws the hero with none of the neon ornaments', () => {
    calm('hero', renderHeroSvg(metrics, { skin }));
    calm('stacked hero', renderHeroSvg(metrics, { skin, stack: 'top' }));
  });

  it('draws the preset cards, wide and beside, with none of them', () => {
    calm('wide', renderPresetCardSvg(metrics, { preset, media: wide, skin }));
    calm('side', renderPresetCardSvg(metrics, { preset, media: square, skin }));
    calm('stacked', renderPresetCardSvg(metrics, { preset, media: wide, skin, stack: 'none' }));
  });

  it('draws the divider and the footer with none of them', () => {
    calm('divider', renderSectionSvg('Presets', { skin, subtitle: 'Five ways' }));
    calm('footer', renderFooterSvg(metrics, { skin }));
  });

  it('keeps the heights of the neon pieces, so stacks still line up', () => {
    const height = (svg: string): number => Number(/viewBox="0 0 1200 (\d+)"/.exec(svg)![1]);
    expect(height(renderHeroSvg(metrics, { skin }))).toBe(height(renderHeroSvg(metrics)));
    expect(height(renderFooterSvg(metrics, { skin }))).toBe(height(renderFooterSvg(metrics)));
    expect(height(renderSectionSvg('Presets', { skin }))).toBe(height(renderSectionSvg('Presets')));
    expect(height(renderPresetCardSvg(metrics, { preset, media: wide, skin }))).toBe(
      height(renderPresetCardSvg(metrics, { preset, media: wide })),
    );
  });

  it('keeps the dial sweep in the hero', () => {
    expect(renderHeroSvg(metrics, { skin })).toContain('class="sweep"');
  });
});

describe('the default hero name', () => {
  it('is set in the card font, not as a wordmark', () => {
    const svg = renderHeroSvg(metrics, { skin });
    expect(svg).not.toMatch(/href="#d\d+"/);
    expect(svg).not.toMatch(/scale\(1\.\d+\)"\/>/);
  });

  it('fits the title bar for every kind of name', () => {
    for (const name of [
      'Al',
      'J',
      'Shine Chikwapulo',
      'A'.repeat(80),
      'José Álvarez',
      '李雷',
      null,
    ]) {
      const { text, size } = layoutPlainName({ name, login: 'sample-user' });
      expect(text.length, String(name)).toBeGreaterThan(0);
      expect(size, String(name)).toBeGreaterThanOrEqual(30);
      expect(size, String(name)).toBeLessThanOrEqual(60);
    }
  });

  it('falls back to the login when no letter survives', () => {
    expect(layoutPlainName({ name: '李雷', login: 'sample-user' }).text).toBe('SAMPLE-USER');
  });
});

describe('the calm page chrome', () => {
  it('runs one border down each side of a middle piece, on the same rail as the neon chrome', () => {
    const svg = chromeLayer(1200, 600, 'none', skin);
    expect(svg).toContain('M14,0 V600 M1186,0 V600');
  });

  it('starts below a top cap and stops above a bottom cap, so pieces join', () => {
    expect(chromeLayer(1200, 600, 'top', skin)).toContain('M14,26 V600');
    expect(chromeLayer(1200, 600, 'bottom', skin)).toContain('M14,0 V574');
  });

  it('is deterministic', () => {
    expect(chromeLayer(1200, 900, 'both', skin)).toBe(chromeLayer(1200, 900, 'both', skin));
  });
});
