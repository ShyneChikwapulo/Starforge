import { describe, expect, it } from 'vitest';
import type { SolidMesh } from './mesh';
import { mergeMeshes, translateMesh } from './mesh-tools';

const triangle = (): SolidMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]),
  colors: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
  indices: new Uint32Array([0, 1, 2]),
});

describe('translateMesh', () => {
  it('moves every vertex and leaves everything else alone', () => {
    const moved = translateMesh(triangle(), 2, 3, 4);
    expect(Array.from(moved.positions)).toEqual([2, 3, 4, 3, 3, 4, 2, 4, 4]);
    expect(moved.normals).toEqual(triangle().normals);
    expect(moved.colors).toEqual(triangle().colors);
    expect(moved.indices).toEqual(triangle().indices);
  });

  it('does not change the original', () => {
    const original = triangle();
    translateMesh(original, 5, 5, 5);
    expect(original.positions).toEqual(triangle().positions);
  });
});

describe('mergeMeshes', () => {
  it('joins the vertices and shifts the indices of later parts', () => {
    const merged = mergeMeshes([triangle(), translateMesh(triangle(), 5, 0)]);
    expect(merged.positions).toHaveLength(18);
    expect(merged.normals).toHaveLength(18);
    expect(merged.colors).toHaveLength(18);
    expect(Array.from(merged.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(merged.positions.slice(9, 12))).toEqual([5, 0, 0]);
  });

  it('merges nothing into an empty mesh', () => {
    const merged = mergeMeshes([]);
    expect(merged.positions).toHaveLength(0);
    expect(merged.indices).toHaveLength(0);
  });
});
