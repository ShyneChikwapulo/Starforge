import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderCardSvg } from './card';
import {
  CYBERPUNK,
  chipStyle,
  createDefaultSkin,
  edgeAttrs,
  resolveSkin,
  trackAttrs,
} from './skin';

const metrics = createSampleMetrics();
const calm = renderCardSvg(metrics, { skin: 'default' });

describe('the default skin', () => {
  it('is a registered skin', () => {
    expect(resolveSkin('default').name).toBe('default');
  });

  it('has no ornaments and no glow', () => {
    expect(calm).not.toContain('class="pulse"');
    expect(calm).not.toContain('url(#glow)');
    expect(calm).not.toContain('bgGlow');
    expect(calm).not.toContain('id="grid"');
    expect(calm).not.toContain('<polygon');
  });

  it('keeps the dial sweep, its one animation', () => {
    expect(calm).toContain('class="sweep"');
  });

  it('draws rounded panels, not chamfered ones', () => {
    expect(calm).toMatch(/A\d+,\d+ 0 0 1/);
  });

  it('uses one flat border colour, never the accent at a low opacity', () => {
    expect(calm).toContain('stroke="#30363d"');
    expect(calm).not.toContain('stroke-opacity="0.55"');
  });

  it('draws outlined chips', () => {
    expect(calm).toContain('fill="#161b22" stroke="#30363d"');
  });

  it('has none of the cyberpunk palette', () => {
    expect(calm).not.toContain('#fcee09');
    expect(calm).not.toContain('#13130d');
  });

  it('takes another accent', () => {
    const blue = renderCardSvg(metrics, { skin: createDefaultSkin('#2f81f4') });
    expect(blue).toContain('#2f81f4');
    expect(blue).not.toContain('#3fb950');
  });
});

describe('the skin helpers', () => {
  it('tint an outline in a neon skin and flatten it in a calm one', () => {
    expect(edgeAttrs(CYBERPUNK, 0.5)).toBe('stroke="#fcee09" stroke-opacity="0.5"');
    expect(edgeAttrs(createDefaultSkin(), 0.5)).toBe('stroke="#30363d"');
  });

  it('do the same for tracks', () => {
    expect(trackAttrs(CYBERPUNK, 0.15)).toBe('fill="#fcee09" fill-opacity="0.15"');
    expect(trackAttrs(createDefaultSkin(), 0.15)).toBe('fill="#21262d"');
  });

  it('read the skin they are given, so a spread skin still works', () => {
    const red = { ...CYBERPUNK, colors: { ...CYBERPUNK.colors, accent: '#ff0000' } };
    expect(edgeAttrs(red, 0.3)).toBe('stroke="#ff0000" stroke-opacity="0.3"');
    expect(chipStyle(red).fill).toBe('#ff0000');
  });

  it('paint chips solid or outlined', () => {
    expect(chipStyle(CYBERPUNK)).toEqual({ fill: '#fcee09', text: '#0a0a08' });
    expect(chipStyle(createDefaultSkin())).toEqual({
      fill: '#161b22',
      text: '#e6edf3',
      stroke: '#30363d',
    });
  });
});
