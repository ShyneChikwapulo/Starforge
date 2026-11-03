import { describe, expect, it } from 'vitest';
import { blendLoop } from './loop';

const frames = Array.from({ length: 10 }, (_, i) => new Float32Array([i, i * 2, i * 3]));

describe('blendLoop', () => {
  it('outputs frames.length - overlap frames', () => {
    expect(blendLoop(frames, 3)).toHaveLength(7);
  });

  it('starts on the simulation continuation, not the recording start', () => {
    const out = blendLoop(frames, 3);
    expect(Array.from(out[0])).toEqual([7, 14, 21]);
  });

  it('blends linearly across the overlap and passes later frames through', () => {
    const out = blendLoop(frames, 3);
    expect(out[1][0]).toBeCloseTo(8 * (2 / 3) + 1 * (1 / 3));
    expect(Array.from(out[3])).toEqual([3, 6, 9]);
  });

  it('steps from the last frame to the first by one natural step', () => {
    const out = blendLoop(frames, 3);
    expect(out[0][0] - out[out.length - 1][0]).toBe(1);
  });

  it('rejects an invalid overlap', () => {
    expect(() => blendLoop(frames, 0)).toThrow(RangeError);
    expect(() => blendLoop(frames, 6)).toThrow(RangeError);
  });
});
