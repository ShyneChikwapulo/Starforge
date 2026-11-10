import { LIGHT_BLOOM_SCALE, LIGHT_INK } from '@starforge/exporters';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { resolveLooks } from './looks';

const resolve = (extra: Record<string, unknown> = {}) =>
  resolveLooks(parseConfig({ username: 'octo', ...extra }));

describe('resolveLooks', () => {
  it('keeps the original look for a default config', () => {
    expect(resolve()).toEqual([
      {
        theme: 'dark',
        suffix: '',
        look: { bloom: { strength: 0.9, levels: 4 } },
        legendBackground: undefined,
      },
    ]);
  });

  it('makes a dark run transparent on request', () => {
    const [only] = resolve({ background: 'transparent' });
    expect(only!.look.background).toBeNull();
    expect(only!.legendBackground).toBeNull();
  });

  it('turns a page colour into a render background and a legend card', () => {
    const [only] = resolve({ background: '#ffffff' });
    expect(only!.look.background).toEqual([1, 1, 1]);
    expect(only!.legendBackground).toBe('#ffffff');
  });

  it('draws the light theme as transparent ink with gentler glow', () => {
    const [only] = resolve({ theme: 'light' });
    expect(only).toMatchObject({ theme: 'light', suffix: '-light', legendBackground: null });
    expect(only!.look.background).toBeNull();
    expect(only!.look.ink).toBe(LIGHT_INK);
    expect(only!.look.bloom!.strength).toBeCloseTo(0.9 * LIGHT_BLOOM_SCALE);
  });

  it('writes the dark set first and the light set second for both', () => {
    const [dark, light, none] = resolve({ theme: 'both' });
    expect(none).toBeUndefined();
    expect(dark).toMatchObject({ theme: 'dark', suffix: '' });
    expect(dark!.look.background).toBeNull();
    expect(dark!.look.ink).toBeUndefined();
    expect(light).toMatchObject({ theme: 'light', suffix: '-light' });
    expect(light!.look.ink).toBe(LIGHT_INK);
  });

  it('turns the glow off in every look when bloom is 0', () => {
    for (const resolved of resolve({ theme: 'both', bloom: 0 })) {
      expect(resolved.look.bloom).toBeNull();
    }
  });
});
