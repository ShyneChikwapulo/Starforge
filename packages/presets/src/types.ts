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

/** A piece of data that one particle stands for, so viewers can explain it on hover. */
export interface Entity {
  /** Index of the particle that represents this item. */
  particle: number;
  kind: 'repository' | 'day';
  title: string;
  detail: string;
}

export interface PresetResult {
  state: ParticleState;
  behaviours: Behaviour[];
  /** Seed to hand to the Simulation so the whole pipeline stays reproducible. */
  seed: number;
  /** The particles that carry data directly, in the order they were placed. */
  entities: Entity[];
}

export interface Preset {
  id: string;
  name: string;
  build(metrics: Metrics, options?: PresetOptions): PresetResult;
}
