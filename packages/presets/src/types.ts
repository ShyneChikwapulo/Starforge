import type { Behaviour, ParticleState } from '@starforge/core';
import type { Metrics } from '@starforge/github-data';

export interface PresetOptions {
  seed?: number;
  /**
   * Target particle count. Particles that carry data directly (one per calendar day,
   * one per repository) are always included, so the result may exceed this.
   */
  particleCount?: number;
  /** Start from a random cloud instead of the final layout, for assembly animations. */
  startScattered?: boolean;
}

export interface PresetResult {
  state: ParticleState;
  behaviours: Behaviour[];
  /** Seed to hand to the Simulation so the whole pipeline stays reproducible. */
  seed: number;
}

export interface Preset {
  id: string;
  name: string;
  build(metrics: Metrics, options?: PresetOptions): PresetResult;
}
