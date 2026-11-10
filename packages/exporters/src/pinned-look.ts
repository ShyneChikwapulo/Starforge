import { createSampleMetrics } from '@starforge/github-data';
import { getPreset } from '@starforge/presets';
import { renderLoop } from './animation';

/** Presets whose default look is pinned: one particle-only, one with a mesh, one with moving bodies. */
export const PINNED_PRESETS = ['galaxy', 'tree', 'atom'] as const;

/** The sum of every byte of every frame, for one preset rendered with the default look. */
export function frameSums(id: (typeof PINNED_PRESETS)[number]): number[] {
  const frames = renderLoop(getPreset(id)!, createSampleMetrics(), {
    width: 64,
    height: 64,
    frames: 4,
    overlap: 1,
    warmup: 5,
    particleCount: 400,
    seed: 3,
  });
  return frames.map((frame) => frame.data.reduce((sum, byte) => sum + byte, 0));
}
