import { LIGHT_BLOOM_SCALE, LIGHT_INK } from '@starforge/exporters';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { GITHUB_PAGE, resolveLooks } from './looks';

const resolve = (extra: Record<string, unknown> = {}) =>
  resolveLooks(parseConfig({ username: 'octo', ...extra }));

const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

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

  it("paints a dark run on GitHub's dark page when asked", () => {
    const [only] = resolve({ background: 'github' });
    expect(only!.look.background).toEqual(rgb(GITHUB_PAGE.dark));
    expect(only!.legendBackground).toBeNull();
  });

  it('draws the light theme on white by default, as ink with gentler glow', () => {
    const [only] = resolve({ theme: 'light' });
    expect(only).toMatchObject({ theme: 'light', suffix: '-light', legendBackground: null });
    expect(only!.look.background).toEqual([1, 1, 1]);
    expect(only!.look.ink).toBe(LIGHT_INK);
    expect(only!.look.bloom!.strength).toBeCloseTo(0.9 * LIGHT_BLOOM_SCALE);
  });

  it('paints each set of both on its own GitHub page colour, dark first', () => {
    const [dark, light, none] = resolve({ theme: 'both' });
    expect(none).toBeUndefined();
    expect(dark).toMatchObject({ theme: 'dark', suffix: '' });
    expect(dark!.look.background).toEqual(rgb(GITHUB_PAGE.dark));
    expect(dark!.look.ink).toBeUndefined();
    expect(light).toMatchObject({ theme: 'light', suffix: '-light' });
    expect(light!.look.background).toEqual(rgb(GITHUB_PAGE.light));
    expect(light!.look.ink).toBe(LIGHT_INK);
  });

  it('keeps the old transparent output for anyone who asks for it', () => {
    for (const resolved of resolve({ theme: 'both', background: 'transparent' })) {
      expect(resolved.look.background).toBeNull();
      expect(resolved.legendBackground).toBeNull();
    }
  });

  it('turns the glow off in every look when bloom is 0', () => {
    for (const resolved of resolve({ theme: 'both', bloom: 0 })) {
      expect(resolved.look.bloom).toBeNull();
    }
  });
});
