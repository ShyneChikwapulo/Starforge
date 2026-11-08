import { describe, expect, it } from 'vitest';
import { getSilhouette } from './tree-silhouette';

const heights = (points: Float32Array): number[] =>
  Array.from(points).filter((_, i) => i % 3 === 1);

describe('getSilhouette', () => {
  it('decodes the wood as a well-formed indexed mesh', () => {
    const { positions, normals, indices } = getSilhouette().mesh;
    expect(positions.length % 3).toBe(0);
    expect(normals.length).toBe(positions.length);
    expect(indices.length % 3).toBe(0);
    expect(indices.length / 3).toBeGreaterThan(1000);
    let top = 0;
    for (const index of indices) if (index > top) top = index;
    expect(top).toBeLessThan(positions.length / 3);
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
  });

  it('stands about one unit tall with its base on the origin', () => {
    const { positions } = getSilhouette().mesh;
    const y = heights(positions);
    expect(Math.min(...y)).toBeGreaterThanOrEqual(-0.05);
    expect(Math.max(...y)).toBeLessThanOrEqual(1.05);
    let x = 0;
    let z = 0;
    let n = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] > 0.05) continue;
      x += positions[i];
      z += positions[i + 2];
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(Math.abs(x / n)).toBeLessThan(0.05);
    expect(Math.abs(z / n)).toBeLessThan(0.05);
  });

  it('spreads the leaves into a crown wider than the trunk is thick', () => {
    const { leaves } = getSilhouette();
    expect(leaves.length / 3).toBeGreaterThan(5000);
    expect(Array.from(leaves).every(Number.isFinite)).toBe(true);
    let reach = 0;
    for (let i = 0; i < leaves.length; i += 3)
      reach = Math.max(reach, Math.hypot(leaves[i], leaves[i + 2]));
    expect(reach).toBeGreaterThan(0.4);
  });

  it('carries a unit normal for nearly every vertex', () => {
    const { normals } = getSilhouette().mesh;
    let unit = 0;
    for (let i = 0; i < normals.length; i += 3) {
      if (Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) < 0.05) unit++;
    }
    expect(unit / (normals.length / 3)).toBeGreaterThan(0.98);
  });

  it('decodes once and shares the result', () => {
    expect(getSilhouette()).toBe(getSilhouette());
  });
});
