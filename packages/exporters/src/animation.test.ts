import { createSampleMetrics } from '@starforge/github-data';
import type { Frame } from '@starforge/renderer-canvas';
import { describe, expect, it } from 'vitest';
import { renderGalaxyLoop } from './animation';

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

describe('renderGalaxyLoop', () => {
  const frames = renderGalaxyLoop(metrics, options);

  it('returns the requested number of frames at the requested size', () => {
    expect(frames).toHaveLength(24);
    expect(frames[0]!.width).toBe(96);
    expect(frames[0]!.data).toHaveLength(96 * 48 * 4);
  });

  it('is deterministic', () => {
    const again = renderGalaxyLoop(metrics, options);
    expect(again[0]!.data).toEqual(frames[0]!.data);
    expect(again[23]!.data).toEqual(frames[23]!.data);
  });

  it('orbits the camera, so frames differ', () => {
    expect(meanDiff(frames[0]!, frames[6]!)).toBeGreaterThan(0);
  });

  it('loops without a visible jump at the seam', () => {
    const steps = frames.slice(1).map((frame, i) => meanDiff(frames[i]!, frame));
    const seam = meanDiff(frames[frames.length - 1]!, frames[0]!);
    expect(seam).toBeLessThanOrEqual(Math.max(...steps) * 1.5);
  });
});
