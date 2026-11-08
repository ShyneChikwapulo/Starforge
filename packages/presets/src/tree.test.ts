import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { buildGalaxy } from './galaxy';
import { buildTree } from './tree';
import type { Entity } from './types';

const sample = createSampleMetrics();
const calendar = sample.contributions.calendar;
const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);
const finite = (values: Float32Array) => Array.from(values).every(Number.isFinite);
const leaves = (entities: Entity[]) => entities.filter((entity) => entity.kind === 'contribution');

describe('buildTree', () => {
  it('has the same particle count as the galaxy, so presets can morph into each other', () => {
    expect(buildTree(sample, { particleCount: 2000 }).state.count).toBe(
      buildGalaxy(sample, { particleCount: 2000 }).state.count,
    );
    expect(buildTree(sample).state.count).toBe(buildGalaxy(sample).state.count);
  });

  it('describes every day, repository and contribution when nothing needs scaling', () => {
    const { entities } = buildTree(sample);
    expect(entities.filter((entity) => entity.kind === 'day')).toHaveLength(calendar.length);
    expect(entities.filter((entity) => entity.kind === 'repository')).toHaveLength(
      sample.repositories.length,
    );
    expect(leaves(entities)).toHaveLength(totalContributions);
  });

  it('scales the leaves down to a budget for very busy years', () => {
    const { entities, state } = buildTree(sample, { particleCount: 1000 });
    const dust = 1000 - calendar.length - sample.repositories.length;
    expect(leaves(entities)).toHaveLength(Math.floor(dust * 0.4));
    expect(state.count).toBe(buildGalaxy(sample, { particleCount: 1000 }).state.count);
  });

  it('grows exactly one leaf per contribution on a day', () => {
    const busiest = calendar.reduce(
      (best, day) => (day.count > best.count ? day : best),
      calendar[0],
    );
    const { entities } = buildTree(sample);
    expect(leaves(entities).filter((entity) => entity.title === busiest.date)).toHaveLength(
      busiest.count,
    );
  });

  it('reads bottom to top as a timeline', () => {
    const { state } = buildTree(sample);
    const last = calendar.length - 1;
    expect(state.target[1]).toBeLessThan(state.target[last * 3 + 1]);
  });

  it('keeps every day tip inside the crown, which is wider than the trunk', () => {
    const { state } = buildTree(sample);
    for (let i = 0; i < calendar.length; i++) {
      const y = state.target[i * 3 + 1];
      expect(y).toBeGreaterThan(-10);
      expect(y).toBeLessThanOrEqual(10.5);
      expect(Math.hypot(state.target[i * 3], state.target[i * 3 + 2])).toBeLessThan(16);
    }
  });

  it('stacks the months as rings from the lowest to the highest', () => {
    const { state } = buildTree(sample);
    const months = new Map<string, { sum: number; n: number }>();
    calendar.forEach((day, i) => {
      const entry = months.get(day.date.slice(0, 7)) ?? { sum: 0, n: 0 };
      entry.sum += state.target[i * 3 + 1];
      entry.n += 1;
      months.set(day.date.slice(0, 7), entry);
    });
    const means = [...months.values()].map((entry) => entry.sum / entry.n);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThanOrEqual(means[i - 1]);
  });

  it('plants the roots below the base of the trunk', () => {
    const { state, entities } = buildTree(sample);
    const roots = entities.filter((entity) => entity.kind === 'repository');
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) expect(state.target[root.particle * 3 + 1]).toBeLessThan(-10);
  });

  it('returns the wood as a solid mesh that stands between the roots and the crown', () => {
    const { mesh } = buildTree(sample);
    expect(mesh).toBeDefined();
    const { positions, normals, colors, indices } = mesh!;
    expect(normals.length).toBe(positions.length);
    expect(colors.length).toBe(positions.length);
    expect(indices.length % 3).toBe(0);
    let top = 0;
    for (const vertex of indices) if (vertex > top) top = vertex;
    expect(top).toBeLessThan(positions.length / 3);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      low = Math.min(low, positions[i]);
      high = Math.max(high, positions[i]);
    }
    expect(low).toBeGreaterThan(-11);
    expect(high).toBeLessThan(11);
    expect(Array.from(colors).every((c) => c >= 0 && c <= 1)).toBe(true);
  });

  it('keeps the wood the same whatever the particle budget', () => {
    const small = buildTree(sample, { particleCount: 2000 }).mesh!;
    const large = buildTree(sample).mesh!;
    expect(small.positions).toEqual(large.positions);
  });

  it('colours fresh twigs greener than old ones', () => {
    const { state } = buildTree(sample);
    const active = calendar.map((day, i) => (day.count > 0 ? i : -1)).filter((i) => i >= 0);
    const oldest = active[0];
    const newest = active[active.length - 1];
    expect(state.color[newest * 3 + 1]).toBeGreaterThan(state.color[oldest * 3 + 1]);
  });

  it('keeps every value finite and colours within 0..1', () => {
    const { state } = buildTree(sample);
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
    const { state } = buildTree(empty, { particleCount: 500 });
    expect(state.count).toBe(500);
    expect(finite(state.target)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = buildTree(sample, { seed: 4, particleCount: 1000 });
    const b = buildTree(sample, { seed: 4, particleCount: 1000 });
    expect(a.state.target).toEqual(b.state.target);
  });
});
