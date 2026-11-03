import { describe, expect, it } from 'vitest';
import { drag, jitter, spring, swirl, type Behaviour } from './behaviours';
import { createRng } from './rng';
import { Simulation } from './simulation';
import { createParticleState, scatterInBox } from './state';

const COUNT = 50;

function makeSimulation(seed: number, behaviours: Behaviour[]): Simulation {
  const state = createParticleState(COUNT);
  scatterInBox(state, createRng(seed), 5);
  for (let p = 0; p < COUNT; p++) {
    const angle = (p / COUNT) * Math.PI * 2;
    state.target[p * 3] = Math.cos(angle) * 3;
    state.target[p * 3 + 2] = Math.sin(angle) * 3;
  }
  return new Simulation({ state, behaviours, seed });
}

const busy = (): Behaviour[] => [
  spring({ stiffness: 8, damping: 3 }),
  swirl({ strength: 1.5 }),
  jitter({ strength: 2 }),
  drag({ coefficient: 0.5 }),
];

describe('Simulation', () => {
  it('is deterministic for the same seed', () => {
    const a = makeSimulation(11, busy());
    const b = makeSimulation(11, busy());
    a.run(120);
    b.run(120);
    expect(a.state.position).toEqual(b.state.position);
  });

  it('diverges for different seeds', () => {
    const a = makeSimulation(11, busy());
    const b = makeSimulation(12, busy());
    a.run(120);
    b.run(120);
    expect(a.state.position).not.toEqual(b.state.position);
  });

  it('advances time by exactly dt per step', () => {
    const sim = makeSimulation(1, []);
    sim.run(60);
    expect(sim.frame).toBe(60);
    expect(sim.time).toBeCloseTo(1);
  });

  it('settles on the targets under a critically damped spring', () => {
    const sim = makeSimulation(3, [spring({ stiffness: 20, damping: 9 })]);
    sim.run(600);
    for (let i = 0; i < sim.state.position.length; i++) {
      expect(Math.abs(sim.state.position[i] - sim.state.target[i])).toBeLessThan(0.01);
    }
  });

  it('slows particles down with drag', () => {
    const sim = makeSimulation(1, [drag({ coefficient: 2 })]);
    sim.state.velocity.fill(1);
    sim.run(60);
    expect(sim.state.velocity[0]).toBeLessThan(0.2);
    expect(sim.state.velocity[0]).toBeGreaterThan(0);
  });

  it('snapshots are copies', () => {
    const sim = makeSimulation(1, [spring({ stiffness: 20, damping: 9 })]);
    const before = sim.snapshot();
    sim.run(10);
    expect(before).not.toEqual(sim.state.position);
  });
});
