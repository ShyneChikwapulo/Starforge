import type { Behaviour, ParticleState, SolidBody, SolidMesh } from '@starforge/core';
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
  kind: 'repository' | 'day' | 'contribution';
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
  /** Solid geometry drawn as real, lit triangles outside the glow, for example a tree's wood. */
  mesh?: SolidMesh;
  /** Solid meshes that move, such as orbiting balls. Drawn together with `mesh`. */
  bodies?: SolidBody[];
}

/** Where the camera starts. It then orbits the origin, so one full turn makes a seamless loop. */
export interface ViewPose {
  /** Rotation around the vertical axis, radians. */
  yaw: number;
  /** Tilt above the scene, radians. */
  pitch: number;
  distance: number;
  /** Vertical field of view, radians. */
  fov: number;
}

export interface Preset {
  id: string;
  name: string;
  /** One sentence explaining how the data maps to the picture. */
  legend: string;
  /** Short caption for the legend strip under a README animation. */
  caption: string;
  /** Where the camera starts. */
  view: ViewPose;
  /** Default pixel size for README animations when the config does not set one. */
  size: { width: number; height: number };
  build(metrics: Metrics, options?: PresetOptions): PresetResult;
}
