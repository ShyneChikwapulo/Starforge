import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderCardSvg } from './card';
import { renderHeroSvg } from './hero';
import { panel } from './hud';
import { renderFooterSvg, renderSectionSvg } from './page-pieces';
import { renderPresetCardSvg } from './preset-card';
import { CYBERPUNK, SKIN_NAMES, resolveSkin } from './skin';

const metrics = createSampleMetrics();
const preset = { id: 'galaxy', name: 'Galaxy', caption: 'Arms: languages' };
const media = { href: 'data:image/webp;base64,AAAA', width: 480, height: 240 };

describe('the cyberpunk skin', () => {
  it('keeps the original palette exactly', () => {
    expect(CYBERPUNK.colors).toEqual({
      accent: '#fcee09',
      accent2: '#2ee6ff',
      bg: '#0a0a08',
      panel: '#13130d',
      row: '#1a1a12',
      text: '#f4f4ee',
      muted: '#a8a56a',
      soft: '#d6d4b4',
    });
  });

  it('draws panels with chamfered corners', () => {
    expect(CYBERPUNK.shape(10, 20, 100, 50, { tl: 8, br: 8 })).toBe(
      panel(10, 20, 100, 50, { tl: 8, br: 8 }),
    );
  });
});

describe('resolveSkin', () => {
  it('defaults to cyberpunk', () => {
    expect(resolveSkin()).toBe(CYBERPUNK);
    expect(resolveSkin(undefined)).toBe(CYBERPUNK);
  });

  it('finds every named skin', () => {
    for (const name of SKIN_NAMES) expect(resolveSkin(name).name).toBe(name);
  });

  it('accepts a whole skin', () => {
    const custom = { ...CYBERPUNK, colors: { ...CYBERPUNK.colors, accent: '#ff0000' } };
    expect(resolveSkin(custom)).toBe(custom);
  });
});

describe('every card takes a skin', () => {
  it('draws the same with the default as with cyberpunk named', () => {
    expect(renderCardSvg(metrics, { skin: 'cyberpunk' })).toBe(renderCardSvg(metrics));
    expect(renderHeroSvg(metrics, { skin: 'cyberpunk' })).toBe(renderHeroSvg(metrics));
    expect(renderPresetCardSvg(metrics, { preset, media, skin: 'cyberpunk' })).toBe(
      renderPresetCardSvg(metrics, { preset, media }),
    );
    expect(renderFooterSvg(metrics, { skin: 'cyberpunk' })).toBe(renderFooterSvg(metrics));
    expect(renderSectionSvg('Presets', { skin: 'cyberpunk' })).toBe(renderSectionSvg('Presets'));
  });

  it('really uses the skin it is given', () => {
    const red = { ...CYBERPUNK, colors: { ...CYBERPUNK.colors, accent: '#ff0000' } };
    for (const svg of [
      renderCardSvg(metrics, { skin: red }),
      renderHeroSvg(metrics, { skin: red }),
      renderPresetCardSvg(metrics, { preset, media, skin: red }),
      renderFooterSvg(metrics, { skin: red }),
      renderSectionSvg('Presets', { skin: red }),
    ]) {
      expect(svg).toContain('#ff0000');
      expect(svg).not.toContain('#fcee09');
    }
  });
});
