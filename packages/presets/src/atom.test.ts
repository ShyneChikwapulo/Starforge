import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { buildAtom } from './atom';
import { buildGalaxy } from './galaxy';

const sample = createSampleMetrics();
const finite = (values: Float32Array) => Array.from(values).every(Number.isFinite);

describe('buildAtom', () => {
  it('has the same particle count as the galaxy, so presets can morph into each other', () => {
    expect(buildAtom(sample, { particleCount: 2000 }).state.count).toBe(
      buildGalaxy(sample, { particleCount: 2000 }).state.count,
    );
    expect(buildAtom(sample).state.count).toBe(buildGalaxy(sample).state.count);
  });

  it('describes every day and every repository', () => {
    const { entities } = buildAtom(sample);
    expect(entities.filter((entity) => entity.kind === 'day')).toHaveLength(
      sample.contributions.calendar.length,
    );
    expect(entities.filter((entity) => entity.kind === 'repository')).toHaveLength(
      sample.repositories.length,
    );
  });

  it('makes one solid ball per language, at most six, bigger for a bigger share', () => {
    const { bodies } = buildAtom(sample);
    expect(bodies).toHaveLength(Math.min(6, sample.languages.length));
    const radius = (positions: Float32Array) =>
      Math.max(
        ...Array.from({ length: positions.length / 3 }, (_, v) =>
          Math.hypot(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]),
        ),
      );
    const radii = bodies!.map((body) => radius(body.mesh.positions));
    for (let i = 1; i < radii.length; i++)
      expect(radii[i]).toBeLessThanOrEqual(radii[i - 1] + 1e-6);
  });

  it('gives each ball a well-formed mesh', () => {
    for (const { mesh } of buildAtom(sample).bodies!) {
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.colors.length).toBe(mesh.positions.length);
      expect(mesh.indices.length % 3).toBe(0);
      expect(Array.from(mesh.colors).every((c) => c >= 0 && c <= 1)).toBe(true);
    }
  });

  it('loops: every ball is back where it started after one turn', () => {
    for (const body of buildAtom(sample).bodies!) {
      const start = body.pose(0);
      const end = body.pose(1);
      expect(end.x).toBeCloseTo(start.x, 6);
      expect(end.y).toBeCloseTo(start.y, 6);
      expect(end.z).toBeCloseTo(start.z, 6);
      expect(Math.cos(end.spin)).toBeCloseTo(Math.cos(start.spin), 6);
      expect(Math.sin(end.spin)).toBeCloseTo(Math.sin(start.spin), 6);
    }
  });

  it('keeps the balls on their rings, clear of the kitten', () => {
    for (const body of buildAtom(sample).bodies!) {
      for (const turns of [0, 0.13, 0.5, 0.77]) {
        const { x, y, z } = body.pose(turns);
        const distance = Math.hypot(x, y, z);
        expect(distance).toBeGreaterThan(11);
        expect(distance).toBeLessThan(19);
      }
    }
  });

  it('returns the rings and constellation links as one static mesh', () => {
    const { mesh } = buildAtom(sample);
    expect(mesh).toBeDefined();
    expect(mesh!.normals.length).toBe(mesh!.positions.length);
    expect(mesh!.colors.length).toBe(mesh!.positions.length);
    let top = 0;
    for (const vertex of mesh!.indices) if (vertex > top) top = vertex;
    expect(top).toBeLessThan(mesh!.positions.length / 3);
  });

  it('keeps every value finite and colours within 0..1', () => {
    const { state } = buildAtom(sample);
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
    const { state, bodies } = buildAtom(empty, { particleCount: 500 });
    expect(state.count).toBe(500);
    expect(bodies).toHaveLength(0);
    expect(finite(state.target)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = buildAtom(sample, { seed: 4, particleCount: 1000 });
    const b = buildAtom(sample, { seed: 4, particleCount: 1000 });
    expect(a.state.target).toEqual(b.state.target);
  });
});

describe('buildAtom labels', () => {
  it('labels each ball with its language and its share of your code', () => {
    for (const body of buildAtom(sample).bodies!) {
      expect(body.label?.title).toBeTruthy();
      expect(body.label?.detail).toMatch(/^\d+(\.\d)?% of your code$/);
    }
  });
});
