import type { Rng } from './rng';
import type { ParticleState } from './state';

export interface StepContext {
  /** Fixed timestep in seconds. */
  readonly dt: number;
  /** Simulation time in seconds. */
  readonly time: number;
  /** The simulation's seeded RNG. Behaviours must use this, never Math.random. */
  readonly rng: Rng;
}

/** A behaviour changes particle velocities. The simulation integrates positions afterwards. */
export type Behaviour = (state: ParticleState, context: StepContext) => void;

/** Damped spring pulling every particle towards its target. */
export function spring(options: { stiffness: number; damping: number }): Behaviour {
  const { stiffness, damping } = options;
  return (state, { dt }) => {
    const { position, velocity, target } = state;
    for (let i = 0; i < position.length; i++) {
      const acceleration = stiffness * (target[i] - position[i]) - damping * velocity[i];
      velocity[i] += acceleration * dt;
    }
  };
}

/** Tangential push around the Y axis, producing a rotating flow. */
export function swirl(options: { strength: number }): Behaviour {
  const { strength } = options;
  return (state, { dt }) => {
    const { position, velocity } = state;
    for (let p = 0; p < state.count; p++) {
      const i = p * 3;
      const x = position[i];
      const z = position[i + 2];
      const radius = Math.sqrt(x * x + z * z) + 1e-6;
      velocity[i] += (-z / radius) * strength * dt;
      velocity[i + 2] += (x / radius) * strength * dt;
    }
  };
}

/** Small random accelerations drawn from the seeded RNG. */
export function jitter(options: { strength: number }): Behaviour {
  const { strength } = options;
  return (state, { dt, rng }) => {
    const { velocity } = state;
    for (let i = 0; i < velocity.length; i++) {
      velocity[i] += (rng() * 2 - 1) * strength * dt;
    }
  };
}

/** Linear drag using only basic arithmetic so results are identical on every platform. */
export function drag(options: { coefficient: number }): Behaviour {
  const { coefficient } = options;
  return (state, { dt }) => {
    const factor = 1 / (1 + coefficient * dt);
    const { velocity } = state;
    for (let i = 0; i < velocity.length; i++) {
      velocity[i] *= factor;
    }
  };
}
