import { describe, expect, it } from 'vitest';
import { getSilhouette } from './tree-silhouette';

const parts = (): Float32Array[] => {
  const { trunk, branches, leaves } = getSilhouette();
  return [trunk, branches, leaves];
};

describe('getSilhouette', () => {
  it('decodes every part as x, y, z triples', () => {
    for (const part of parts()) {
      expect(part.length % 3).toBe(0);
      expect(part.length / 3).toBeGreaterThan(500);
      expect(Array.from(part).every(Number.isFinite)).toBe(true);
    }
  });

  it('stands one unit tall on the origin', () => {
    const heights = parts().flatMap((part) => Array.from(part).filter((_, i) => i % 3 === 1));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-0.01);
    expect(Math.max(...heights)).toBeLessThanOrEqual(1.01);
    expect(Math.max(...heights)).toBeGreaterThan(0.9);
  });

  it('is wider than a trunk: the leaves spread well past the base', () => {
    const { leaves, trunk } = getSilhouette();
    const reach = (points: Float32Array) =>
      Math.max(
        ...Array.from(points)
          .filter((_, i) => i % 3 === 0)
          .map(Math.abs),
      );
    expect(reach(leaves)).toBeGreaterThan(0.5);
    expect(reach(leaves)).toBeGreaterThan(reach(trunk));
  });

  it('decodes once and shares the result', () => {
    expect(getSilhouette()).toBe(getSilhouette());
  });
});
