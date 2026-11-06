import { Simulation, blendLoop } from '@starforge/core';
import type { Metrics } from '@starforge/github-data';
import { galaxyPreset, type Preset } from '@starforge/presets';
import {
  orbitCamera,
  renderFrame,
  type BloomOptions,
  type Camera,
  type Frame,
} from '@starforge/renderer-canvas';

export interface LoopOptions {
  width: number;
  height: number;
  /** Frames in the finished loop. */
  frames: number;
  /** Extra simulation frames blended into the start for a seamless seam. Default: frames / 4. */
  overlap?: number;
  seed?: number;
  /** Simulation frames to run before recording, so the shimmer has settled. Default 120. */
  warmup?: number;
  particleCount?: number;
  /** Overrides the preset's own starting view. */
  camera?: Camera;
  /** RGB 0..1, or null for a transparent background. Default: a deep navy. */
  background?: [number, number, number] | null;
  exposure?: number;
  /** Glow around bright particles. Pass null to turn bloom off. Default: moderate bloom. */
  bloom?: BloomOptions | null;
}

const DEFAULT_BACKGROUND: [number, number, number] = [0.02, 0.03, 0.06];
const DEFAULT_BLOOM: BloomOptions = { strength: 0.9, levels: 4 };

/**
 * Render a seamlessly looping animation of any preset. The camera makes exactly one full orbit,
 * and the simulation's tail is blended into its head, so the last frame flows into the first.
 */
export function renderLoop(preset: Preset, metrics: Metrics, options: LoopOptions): Frame[] {
  const { width, height, frames: length } = options;
  const seed = options.seed ?? 1;
  const overlap = options.overlap ?? Math.max(1, Math.round(length / 4));

  const { state, behaviours } = preset.build(metrics, {
    seed,
    particleCount: options.particleCount,
  });
  const simulation = new Simulation({ state, behaviours, seed });
  simulation.run(options.warmup ?? 120);

  const recorded: Float32Array[] = [];
  for (let i = 0; i < length + overlap; i++) {
    recorded.push(simulation.snapshot());
    simulation.step();
  }
  const looped = blendLoop(recorded, overlap);

  const camera = options.camera ?? preset.view;
  const background = options.background === undefined ? DEFAULT_BACKGROUND : options.background;
  return looped.map((positions, i) => {
    state.position.set(positions);
    return renderFrame(state, {
      width,
      height,
      camera: orbitCamera(camera, i / length),
      background,
      exposure: options.exposure ?? 1.4,
      bloom: options.bloom === undefined ? DEFAULT_BLOOM : (options.bloom ?? undefined),
    });
  });
}

/** The galaxy preset's loop, kept for callers that predate presets. */
export function renderGalaxyLoop(metrics: Metrics, options: LoopOptions): Frame[] {
  return renderLoop(galaxyPreset, metrics, options);
}
