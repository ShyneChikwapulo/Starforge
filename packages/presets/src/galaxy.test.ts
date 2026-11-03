import { Simulation } from '@starforge/core';
import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { buildGalaxy } from './galaxy';

const sample = createSampleMetrics();
const finite = (values: Float32Array) => Array.from(values).every(Number.isFinite);

describe('buildGalaxy', () => {
  it('fills the requested particle budget', () => {
    expect(buildGalaxy(sample, { particleCount: 2000 }).state.count).toBe(2000);
  });

  it('always includes one particle per day and per repository', () => {
    const { state } = buildGalaxy(sample, { particleCount: 100 });
    expect(state.count).toBe(sample.contributions.calendar.length + sample.repositories.length);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = buildGalaxy(sample, { seed: 5, particleCount: 1000 });
    const b = buildGalaxy(sample, { seed: 5, particleCount: 1000 });
    const c = buildGalaxy(sample, { seed: 6, particleCount: 1000 });
    expect(a.state.target).toEqual(b.state.target);
    expect(a.state.target).not.toEqual(c.state.target);
  });

  it('maps daily activity to ring height', () => {
    const { state } = buildGalaxy(sample, { particleCount: 2000 });
    const counts = sample.contributions.calendar.map((d) => d.count);
    const heights = counts.map((_, i) => state.target[i * 3 + 1]);
    expect(heights[counts.indexOf(Math.max(...counts))]).toBe(Math.max(...heights));
    counts.forEach((count, i) => {
      if (count === 0) expect(heights[i]).toBe(0);
    });
  });

  it('sizes repository stars by their star count', () => {
    const repo = sample.repositories[0];
    const metrics: Metrics = {
      ...sample,
      repositories: [
        { ...repo, name: 'old', stars: 0, createdAt: '2020-01-01T00:00:00Z' },
        { ...repo, name: 'new', stars: 500, createdAt: '2021-01-01T00:00:00Z' },
      ],
    };
    const { state } = buildGalaxy(metrics, { particleCount: 1000 });
    const first = sample.contributions.calendar.length;
    expect(state.size[first + 1]).toBeGreaterThan(state.size[first]);
  });

  it('keeps every value finite and colours within 0..1', () => {
    const { state } = buildGalaxy(sample);
    expect(finite(state.target)).toBe(true);
    expect(finite(state.position)).toBe(true);
    expect(Array.from(state.color).every((c) => c >= 0 && c <= 1)).toBe(true);
  });

  it('handles a profile with no data', () => {
    const empty: Metrics = {
      ...sample,
      languages: [],
      repositories: [],
      contributions: { ...sample.contributions, calendar: [] },
      totals: { repositories: 0, stars: 0, forks: 0 },
    };
    const { state } = buildGalaxy(empty, { particleCount: 500 });
    expect(state.count).toBe(500);
    expect(finite(state.target)).toBe(true);
  });

  it('runs in the simulation without blowing up', () => {
    const { state, behaviours, seed } = buildGalaxy(sample, { particleCount: 500 });
    const sim = new Simulation({ state, behaviours, seed });
    sim.run(30);
    expect(finite(state.position)).toBe(true);
  });
});
