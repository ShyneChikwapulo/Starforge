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

/** What every look of one loop has in common: its size, its length and what is simulated. */
export interface LoopShape {
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
}

/** How one render is painted. */
export interface Look {
  /** RGB 0..1, or null for a transparent background. Default: a deep navy. */
  background?: [number, number, number] | null;
  exposure?: number;
  /** Glow around bright particles. Pass null to turn bloom off. Default: moderate bloom. */
  bloom?: BloomOptions | null;
  /** Draw for a light page; see `ink` in the renderer's options. Default: the dark-page glow. */
  ink?: number;
}

export interface LoopOptions extends LoopShape, Look {}

const DEFAULT_BACKGROUND: [number, number, number] = [0.02, 0.03, 0.06];
const DEFAULT_BLOOM: BloomOptions = { strength: 0.9, levels: 4 };

/** Particle colour multiplier for a light page, so the glow reads as ink instead of light. */
export const LIGHT_INK = 0.6;
/** Bloom is gentler on a light page, where it shows as a pale halo instead of added light. */
export const LIGHT_BLOOM_SCALE = 0.6;

/**
 * Render a seamlessly looping animation once per look. The simulation runs a single time and
 * every look is painted from the same frames, so a second look costs only its rendering. The
 * camera makes exactly one full orbit, and the simulation's tail is blended into its head, so
 * the last frame flows into the first.
 */
export function renderLoops(
  preset: Preset,
  metrics: Metrics,
  shape: LoopShape,
  looks: readonly Look[],
): Frame[][] {
  const { width, height, frames: length } = shape;
  const seed = shape.seed ?? 1;
  const overlap = shape.overlap ?? Math.max(1, Math.round(length / 4));

  const { state, behaviours, mesh, bodies } = preset.build(metrics, {
    seed,
    particleCount: shape.particleCount,
  });
  const simulation = new Simulation({ state, behaviours, seed });
  simulation.run(shape.warmup ?? 120);

  const recorded: Float32Array[] = [];
  for (let i = 0; i < length + overlap; i++) {
    recorded.push(simulation.snapshot());
    simulation.step();
  }
  const looped = blendLoop(recorded, overlap);

  const camera = shape.camera ?? preset.view;
  return looks.map((look) => {
    const background = look.background === undefined ? DEFAULT_BACKGROUND : look.background;
    return looped.map((positions, i) => {
      state.position.set(positions);
      return renderFrame(state, {
        width,
        height,
        camera: orbitCamera(camera, i / length),
        background,
        mesh,
        bodies: bodies?.map((body) => ({ mesh: body.mesh, pose: body.pose(i / length) })),
        exposure: look.exposure ?? 1.4,
        bloom: look.bloom === undefined ? DEFAULT_BLOOM : (look.bloom ?? undefined),
        ink: look.ink,
      });
    });
  });
}

/** Render a seamlessly looping animation of any preset in a single look. */
export function renderLoop(preset: Preset, metrics: Metrics, options: LoopOptions): Frame[] {
  const { background, exposure, bloom, ink, ...shape } = options;
  return renderLoops(preset, metrics, shape, [{ background, exposure, bloom, ink }])[0]!;
}

/** The galaxy preset's loop, kept for callers that predate presets. */
export function renderGalaxyLoop(metrics: Metrics, options: LoopOptions): Frame[] {
  return renderLoop(galaxyPreset, metrics, options);
}
