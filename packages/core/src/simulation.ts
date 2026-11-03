import type { Behaviour } from './behaviours';
import { createRng, type Rng } from './rng';
import type { ParticleState } from './state';

export interface SimulationOptions {
  state: ParticleState;
  behaviours: readonly Behaviour[];
  seed: number;
  /** Fixed timestep in seconds. Defaults to 1/60. */
  dt?: number;
}

/**
 * Fixed-timestep, semi-implicit Euler simulation.
 * Given the same state, behaviours and seed it produces identical frames every run.
 */
export class Simulation {
  readonly state: ParticleState;
  readonly dt: number;
  frame = 0;

  private readonly behaviours: readonly Behaviour[];
  private readonly rng: Rng;

  constructor(options: SimulationOptions) {
    this.state = options.state;
    this.behaviours = options.behaviours;
    this.dt = options.dt ?? 1 / 60;
    this.rng = createRng(options.seed);
  }

  get time(): number {
    return this.frame * this.dt;
  }

  step(): void {
    const context = { dt: this.dt, time: this.time, rng: this.rng };
    for (const behaviour of this.behaviours) {
      behaviour(this.state, context);
    }
    const { position, velocity } = this.state;
    for (let i = 0; i < position.length; i++) {
      position[i] += velocity[i] * this.dt;
    }
    this.frame += 1;
  }

  run(frames: number): void {
    for (let i = 0; i < frames; i++) this.step();
  }

  /** A copy of the current positions, safe to keep while the simulation continues. */
  snapshot(): Float32Array {
    return this.state.position.slice();
  }
}
