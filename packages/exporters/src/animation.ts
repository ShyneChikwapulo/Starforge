import { Simulation, blendLoop } from '@starforge/core';
import type { Metrics } from '@starforge/github-data';
import { buildGalaxy } from '@starforge/presets';
import {
  DEFAULT_CAMERA,
  orbitCamera,
  renderFrame,
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
  camera?: Camera;
  /** RGB 0..1, or null for a transparent background. Default: a deep navy. */
  background?: [number, number, number] | null;
  exposure?: number;
}

const DEFAULT_BACKGROUND: [number, number, number] = [0.02, 0.03, 0.06];

/**
 * Render a seamlessly looping galaxy. The camera makes exactly one full orbit, and the
 * simulation's tail is blended into its head, so the last frame flows into the first.
 */
export function renderGalaxyLoop(metrics: Metrics, options: LoopOptions): Frame[] {
  const { width, height, frames: length } = options;
  const seed = options.seed ?? 1;
  const overlap = options.overlap ?? Math.max(1, Math.round(length / 4));

  const { state, behaviours } = buildGalaxy(metrics, {
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

  const camera = options.camera ?? DEFAULT_CAMERA;
  const background = options.background === undefined ? DEFAULT_BACKGROUND : options.background;
  return looped.map((positions, i) => {
    state.position.set(positions);
    return renderFrame(state, {
      width,
      height,
      camera: orbitCamera(camera, i / length),
      background,
      exposure: options.exposure ?? 1.4,
    });
  });
}
