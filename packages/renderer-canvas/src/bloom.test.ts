import { createParticleState } from '@starforge/core';
import { describe, expect, it } from 'vitest';
import { applyBloom } from './bloom';
import { renderFrame } from './render';

const W = 32;
const H = 32;
const at = (x: number, y: number) => (y * W + x) * 3;

function hotPixel(): Float32Array {
  const buffer = new Float32Array(W * H * 3);
  buffer[at(16, 16)] = 10;
  return buffer;
}

describe('applyBloom', () => {
  it('spreads light to neighbouring pixels', () => {
    const buffer = hotPixel();
    applyBloom(buffer, W, H, { strength: 1 });
    expect(buffer[at(20, 16)]).toBeGreaterThan(0);
    expect(buffer[at(16, 16)]).toBeGreaterThan(10);
  });

  it('does nothing at zero strength', () => {
    const buffer = hotPixel();
    applyBloom(buffer, W, H, { strength: 0 });
    expect(buffer).toEqual(hotPixel());
  });

  it('is deterministic', () => {
    const a = hotPixel();
    const b = hotPixel();
    applyBloom(a, W, H, { strength: 0.8, levels: 3 });
    applyBloom(b, W, H, { strength: 0.8, levels: 3 });
    expect(a).toEqual(b);
  });
});

describe('renderFrame with bloom', () => {
  const state = createParticleState(1);
  state.color.fill(1);
  state.size[0] = 5;
  const camera = { yaw: 0, pitch: 0, distance: 10, fov: Math.PI / 4 };
  const total = (bloom?: { strength: number }) =>
    renderFrame(state, { width: 96, height: 48, camera, background: [0, 0, 0], bloom }).data.reduce(
      (sum, value) => sum + value,
      0,
    );

  it('adds light compared with no bloom', () => {
    expect(total({ strength: 1 })).toBeGreaterThan(total());
  });

  it('matches the plain render at zero strength', () => {
    expect(total({ strength: 0 })).toBe(total());
  });
});
