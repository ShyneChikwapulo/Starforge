import { createSampleMetrics } from '@starforge/github-data';
import { tunnelPreset } from '@starforge/presets';
import type { Frame } from '@starforge/renderer-canvas';
import { describe, expect, it } from 'vitest';
import { renderGalaxyLoop, renderLoop } from './animation';

const metrics = createSampleMetrics();
const options = {
  width: 96,
  height: 48,
  frames: 24,
  overlap: 6,
  warmup: 10,
  particleCount: 600,
  seed: 3,
};

function meanDiff(a: Frame, b: Frame): number {
  let total = 0;
  for (let i = 0; i < a.data.length; i++) total += Math.abs(a.data[i] - b.data[i]);
  return total / a.data.length;
}

describe('renderLoop with the tunnel preset', () => {
  const frames = renderLoop(tunnelPreset, metrics, options);

  it('returns the requested number of frames at the requested size', () => {
    expect(frames).toHaveLength(24);
    expect(frames[0].width).toBe(96);
    expect(frames[0].data).toHaveLength(96 * 48 * 4);
  });

  it('looks different from the galaxy', () => {
    expect(meanDiff(frames[0], renderGalaxyLoop(metrics, options)[0])).toBeGreaterThan(0);
  });

  it('loops without a visible jump at the seam', () => {
    const steps = frames.slice(1).map((frame, i) => meanDiff(frames[i], frame));
    const seam = meanDiff(frames[frames.length - 1], frames[0]);
    expect(seam).toBeLessThanOrEqual(Math.max(...steps) * 1.5);
  });
});
