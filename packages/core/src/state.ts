import type { Rng } from './rng';

/** Struct-of-arrays particle data. Vectors are packed as x, y, z per particle. */
export interface ParticleState {
  readonly count: number;
  readonly position: Float32Array;
  readonly velocity: Float32Array;
  /** Where each particle "wants" to be; behaviours such as `spring` pull towards it. */
  readonly target: Float32Array;
  /** Linear RGB, 0 to 1 per channel. */
  readonly color: Float32Array;
  readonly size: Float32Array;
}

export function createParticleState(count: number): ParticleState {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative integer');
  }
  return {
    count,
    position: new Float32Array(count * 3),
    velocity: new Float32Array(count * 3),
    target: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    size: new Float32Array(count).fill(1),
  };
}

/** Scatter positions uniformly inside a cube centred on the origin. */
export function scatterInBox(state: ParticleState, rng: Rng, halfExtent: number): void {
  for (let i = 0; i < state.position.length; i++) {
    state.position[i] = (rng() * 2 - 1) * halfExtent;
  }
}
