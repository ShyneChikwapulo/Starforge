import { createSampleMetrics } from '@starforge/github-data';
import { getPreset } from '@starforge/presets';
import { describe, expect, it } from 'vitest';
import { LIGHT_INK, renderLoop, renderLoops } from './animation';

const metrics = createSampleMetrics();
const preset = getPreset('galaxy')!;
const shape = {
  width: 64,
  height: 32,
  frames: 6,
  overlap: 2,
  warmup: 5,
  particleCount: 400,
  seed: 3,
};
const dark = { background: null };
const light = { background: null, ink: LIGHT_INK };

describe('renderLoops', () => {
  it('renders the same frames as renderLoop for a single look', () => {
    const [only] = renderLoops(preset, metrics, shape, [{}]);
    expect(only![3]!.data).toEqual(renderLoop(preset, metrics, shape)[3]!.data);
  });

  it('gives one full set of frames per look', () => {
    const [a, b] = renderLoops(preset, metrics, shape, [dark, light]);
    expect(a).toHaveLength(6);
    expect(b).toHaveLength(6);
  });

  it('keeps the opacity of the dark look and only darkens the colour in the light one', () => {
    const [a, b] = renderLoops(preset, metrics, shape, [dark, light]);
    const before = a![0]!.data;
    const after = b![0]!.data;
    let lit = 0;
    let sameAlpha = true;
    let neverBrighter = true;
    for (let i = 0; i < before.length; i += 4) {
      if (after[i + 3] !== before[i + 3]) sameAlpha = false;
      if (before[i + 3]! > 0) {
        lit++;
        if (after[i]! > before[i]! || after[i + 1]! > before[i + 1]!) neverBrighter = false;
      }
    }
    expect(lit).toBeGreaterThan(0);
    expect(sameAlpha).toBe(true);
    expect(neverBrighter).toBe(true);
  });

  it('does not depend on the order of the looks', () => {
    const [a1, b1] = renderLoops(preset, metrics, shape, [dark, light]);
    const [b2, a2] = renderLoops(preset, metrics, shape, [light, dark]);
    expect(a2![2]!.data).toEqual(a1![2]!.data);
    expect(b2![2]!.data).toEqual(b1![2]!.data);
  });
});
