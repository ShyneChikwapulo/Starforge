import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { buildGalaxy } from './galaxy';
import { buildTunnel } from './tunnel';

const sample = createSampleMetrics();
const finite = (values: Float32Array) => Array.from(values).every(Number.isFinite);
const radius = (target: Float32Array, particle: number) =>
  Math.hypot(target[particle * 3], target[particle * 3 + 1]);

describe('buildTunnel', () => {
  it('has the same particle count as the galaxy, so presets can morph into each other', () => {
    expect(buildTunnel(sample, { particleCount: 2000 }).state.count).toBe(
      buildGalaxy(sample, { particleCount: 2000 }).state.count,
    );
    expect(buildTunnel(sample).state.count).toBe(buildGalaxy(sample).state.count);
  });

  it('describes exactly the same entities as the galaxy', () => {
    expect(buildTunnel(sample).entities).toEqual(buildGalaxy(sample).entities);
  });

  it('lays time along the axis, oldest day at one end and newest at the other', () => {
    const { state } = buildTunnel(sample);
    const last = sample.contributions.calendar.length - 1;
    expect(state.target[2]).toBeCloseTo(-15, 3);
    expect(state.target[last * 3 + 2]).toBeCloseTo(15, 3);
  });

  it('pulls busy days towards the axis', () => {
    const { state } = buildTunnel(sample);
    const days = sample.contributions.calendar;
    const busiest = days.reduce((best, day, i) => (day.count > days[best].count ? i : best), 0);
    const quiet = days.findIndex((day) => day.count === 0);
    expect(quiet).toBeGreaterThanOrEqual(0);
    expect(radius(state.target, busiest)).toBeLessThan(radius(state.target, quiet));
  });

  it('keeps every value finite and colours within 0..1', () => {
    const { state } = buildTunnel(sample);
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
    const { state } = buildTunnel(empty, { particleCount: 500 });
    expect(state.count).toBe(500);
    expect(finite(state.target)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = buildTunnel(sample, { seed: 4, particleCount: 1000 });
    const b = buildTunnel(sample, { seed: 4, particleCount: 1000 });
    expect(a.state.target).toEqual(b.state.target);
  });
});
