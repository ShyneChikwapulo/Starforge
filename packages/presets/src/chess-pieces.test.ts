import type { SolidMesh } from '@starforge/core';
import { describe, expect, it } from 'vitest';
import {
  PIECE_KINDS,
  PIECE_SPECS,
  addBox,
  addPiece,
  createMeshBuilder,
  toMesh,
  type PieceKind,
} from './chess-pieces';

const COLOR: [number, number, number] = [0.2, 0.8, 0.3];

function piece(kind: PieceKind, x = 0, z = 0): SolidMesh {
  const b = createMeshBuilder();
  addPiece(b, kind, x, z, COLOR);
  return toMesh(b);
}

function bounds(mesh: SolidMesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[i + axis]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return { min, max };
}

/** The smallest agreement between a triangle's winding and its vertex normals. */
function worstWinding(mesh: SolidMesh): number {
  const at = (i: number, axis: number): number => mesh.positions[i * 3 + axis]!;
  let worst = Infinity;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const a = mesh.indices[k]!;
    const b = mesh.indices[k + 1]!;
    const c = mesh.indices[k + 2]!;
    const ux = at(b, 0) - at(a, 0);
    const uy = at(b, 1) - at(a, 1);
    const uz = at(b, 2) - at(a, 2);
    const vx = at(c, 0) - at(a, 0);
    const vy = at(c, 1) - at(a, 1);
    const vz = at(c, 2) - at(a, 2);
    const normal = (axis: number): number =>
      mesh.normals[a * 3 + axis]! + mesh.normals[b * 3 + axis]! + mesh.normals[c * 3 + axis]!;
    worst = Math.min(
      worst,
      (uy * vz - uz * vy) * normal(0) +
        (uz * vx - ux * vz) * normal(1) +
        (ux * vy - uy * vx) * normal(2),
    );
  }
  return worst;
}

describe('chess pieces', () => {
  for (const kind of PIECE_KINDS) {
    describe(kind, () => {
      it('is a well-formed mesh', () => {
        const mesh = piece(kind);
        const vertices = mesh.positions.length / 3;
        expect(vertices).toBeGreaterThan(0);
        expect(mesh.normals).toHaveLength(vertices * 3);
        expect(mesh.colors).toHaveLength(vertices * 3);
        expect(mesh.indices.length % 3).toBe(0);
        let top = 0;
        for (const index of mesh.indices) top = Math.max(top, index);
        expect(top).toBeLessThan(vertices);
        expect(mesh.positions.every(Number.isFinite)).toBe(true);
        let worst = 0;
        for (let i = 0; i < vertices; i++) {
          const length = Math.hypot(
            mesh.normals[i * 3]!,
            mesh.normals[i * 3 + 1]!,
            mesh.normals[i * 3 + 2]!,
          );
          worst = Math.max(worst, Math.abs(length - 1));
        }
        expect(worst).toBeLessThan(1e-4);
      });

      it('winds every triangle to agree with its normals', () => {
        expect(worstWinding(piece(kind))).toBeGreaterThan(-1e-6);
      });

      it('stands on the board, as tall as its spec, inside its square', () => {
        const { min, max } = bounds(piece(kind));
        const { height } = PIECE_SPECS[kind];
        expect(Math.abs(min[1]!)).toBeLessThan(1e-6);
        expect(max[1]!).toBeGreaterThan(height * 0.97);
        expect(max[1]!).toBeLessThan(height * 1.01);
        expect(Math.max(-min[0]!, max[0]!, -min[2]!, max[2]!)).toBeLessThanOrEqual(0.5);
      });
    });
  }

  it('gets taller from pawn to king', () => {
    const heights = PIECE_KINDS.map((kind) => bounds(piece(kind)).max[1]!);
    for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeGreaterThan(heights[i - 1]!);
  });

  it('uses the colour it is given', () => {
    const mesh = piece('queen');
    for (let i = 0; i < mesh.colors.length; i += 3) {
      expect(Array.from(mesh.colors.slice(i, i + 3))).toEqual(COLOR.map(Math.fround));
    }
  });

  it('stands where it is put', () => {
    const { min, max } = bounds(piece('rook', 3, -2));
    expect((min[0]! + max[0]!) / 2).toBeCloseTo(3, 4);
    expect((min[2]! + max[2]!) / 2).toBeCloseTo(-2, 4);
  });

  it('has the knight look towards -x', () => {
    let minX = Infinity;
    let maxX = -Infinity;
    const mesh = piece('knight');
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i + 1]! < 0.7) continue;
      minX = Math.min(minX, mesh.positions[i]!);
      maxX = Math.max(maxX, mesh.positions[i]!);
    }
    // The snout reaches out on the -x side, and nothing above the base sticks out behind.
    expect(minX).toBeLessThan(-0.25);
    expect(maxX).toBeLessThan(0.25);
  });
});

describe('addBox', () => {
  it('builds a box with flat faces that fills the size it is given', () => {
    const b = createMeshBuilder();
    addBox(b, [1, 2, 3], [2, 4, 6], COLOR);
    const mesh = toMesh(b);
    expect(mesh.positions).toHaveLength(24 * 3);
    expect(mesh.indices).toHaveLength(36);
    const { min, max } = bounds(mesh);
    expect(min).toEqual([0, 0, 0]);
    expect(max).toEqual([2, 4, 6]);
    expect(worstWinding(mesh)).toBeGreaterThan(-1e-6);
  });
});
