import type { SolidMesh } from '@starforge/core';
import type { Rgb } from './scale';

/**
 * Solid chess pieces and boxes, for the chess preset. A board square is 1 unit wide, a piece
 * stands on y = 0 at the (x, z) it is given, and every piece fits inside its square. Knights
 * face -x. Pieces get taller from pawn to king, which is how the preset shows how busy a day was.
 */

type Vec = [number, number, number];
/** A turned shape as (radius, height) pairs from the bottom centre up to the top centre, each 0..1. */
type Profile = readonly (readonly [number, number])[];

const TAU = Math.PI * 2;
/** Corners sharper than this stay sharp; gentler ones are shaded smoothly. */
const CREASE_COS = Math.cos((40 * Math.PI) / 180);

export type PieceKind = 'pawn' | 'knight' | 'rook' | 'queen' | 'king';
export const PIECE_KINDS: readonly PieceKind[] = ['pawn', 'knight', 'rook', 'queen', 'king'];

export interface PieceSpec {
  /** Height from the board to the top, in squares. */
  height: number;
  /** Radius of the base, in squares. */
  radius: number;
  /** Sides around a turned part. */
  segments: number;
}

export const PIECE_SPECS: Record<PieceKind, PieceSpec> = {
  pawn: { height: 0.75, radius: 0.27, segments: 16 },
  knight: { height: 1.2, radius: 0.33, segments: 18 },
  rook: { height: 1.4, radius: 0.33, segments: 20 },
  queen: { height: 1.85, radius: 0.37, segments: 24 },
  king: { height: 2.3, radius: 0.38, segments: 24 },
};

const PAWN: Profile = [
  [0, 0],
  [1, 0],
  [1, 0.07],
  [0.9, 0.12],
  [0.55, 0.22],
  [0.42, 0.4],
  [0.4, 0.52],
  [0.62, 0.58],
  [0.62, 0.63],
  [0.4, 0.68],
  [0.5, 0.76],
  [0.58, 0.85],
  [0.52, 0.94],
  [0.3, 0.99],
  [0, 1],
];

const KNIGHT_BASE: Profile = [
  [0, 0],
  [1, 0],
  [1, 0.1],
  [0.85, 0.16],
  [0.55, 0.3],
  [0.5, 0.72],
  [0.66, 0.8],
  [0.66, 0.9],
  [0, 1],
];

const ROOK: Profile = [
  [0, 0],
  [1, 0],
  [1, 0.07],
  [0.85, 0.12],
  [0.66, 0.2],
  [0.62, 0.7],
  [0.82, 0.78],
  [0.86, 0.82],
  [0.86, 1],
  [0, 1],
];

const QUEEN: Profile = [
  [0, 0],
  [1, 0],
  [1, 0.05],
  [0.9, 0.08],
  [0.62, 0.15],
  [0.42, 0.34],
  [0.36, 0.55],
  [0.5, 0.6],
  [0.5, 0.64],
  [0.38, 0.68],
  [0.5, 0.82],
  [0.72, 0.88],
  [0.74, 0.92],
  [0.5, 0.93],
  [0.3, 0.95],
  [0.25, 0.97],
  [0.18, 1],
  [0, 1],
];

const KING: Profile = [
  [0, 0],
  [1, 0],
  [1, 0.05],
  [0.9, 0.09],
  [0.62, 0.17],
  [0.4, 0.38],
  [0.34, 0.58],
  [0.5, 0.64],
  [0.5, 0.68],
  [0.36, 0.72],
  [0.46, 0.84],
  [0.7, 0.92],
  [0.7, 0.97],
  [0.4, 0.98],
  [0, 1],
];

export interface MeshBuilder {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

export function createMeshBuilder(): MeshBuilder {
  return { positions: [], normals: [], colors: [], indices: [] };
}

export function toMesh(b: MeshBuilder): SolidMesh {
  return {
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    colors: Float32Array.from(b.colors),
    indices: Uint32Array.from(b.indices),
  };
}

const cross = (u: Vec, v: Vec): Vec => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];

function unit(v: Vec): Vec {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function vertex(b: MeshBuilder, p: Vec, n: Vec, c: Rgb): number {
  b.positions.push(p[0], p[1], p[2]);
  b.normals.push(n[0], n[1], n[2]);
  b.colors.push(c[0], c[1], c[2]);
  return b.positions.length / 3 - 1;
}

/** A triangle wound so that its geometric normal agrees with its vertex normals. */
function triangle(b: MeshBuilder, i: number, j: number, k: number): void {
  const p = b.positions;
  const n = b.normals;
  const ux = p[j * 3]! - p[i * 3]!;
  const uy = p[j * 3 + 1]! - p[i * 3 + 1]!;
  const uz = p[j * 3 + 2]! - p[i * 3 + 2]!;
  const vx = p[k * 3]! - p[i * 3]!;
  const vy = p[k * 3 + 1]! - p[i * 3 + 1]!;
  const vz = p[k * 3 + 2]! - p[i * 3 + 2]!;
  const dot =
    (uy * vz - uz * vy) * (n[i * 3]! + n[j * 3]! + n[k * 3]!) +
    (uz * vx - ux * vz) * (n[i * 3 + 1]! + n[j * 3 + 1]! + n[k * 3 + 1]!) +
    (ux * vy - uy * vx) * (n[i * 3 + 2]! + n[j * 3 + 2]! + n[k * 3 + 2]!);
  if (dot < 0) b.indices.push(i, k, j);
  else b.indices.push(i, j, k);
}

/** A shape turned around the vertical axis through `at`. */
function addLathe(
  b: MeshBuilder,
  profile: Profile,
  radius: number,
  height: number,
  at: Vec,
  color: Rgb,
  segments: number,
): void {
  const points = profile.map(([r, y]) => [r * radius, y * height] as const);
  // The outward normal of each profile segment is on the right of its direction of travel.
  const normals: [number, number][] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const dr = points[k + 1]![0] - points[k]![0];
    const dy = points[k + 1]![1] - points[k]![1];
    const length = Math.hypot(dr, dy) || 1;
    normals.push([dy / length, -dr / length]);
  }
  // The normal shared with the previous segment, or null where the corner is sharp.
  const smooth = (s: number): [number, number] | null => {
    if (s <= 0 || s >= normals.length) return null;
    const a = normals[s - 1]!;
    const c = normals[s]!;
    if (a[0] * c[0] + a[1] * c[1] < CREASE_COS) return null;
    const x = a[0] + c[0];
    const y = a[1] + c[1];
    const length = Math.hypot(x, y) || 1;
    return [x / length, y / length];
  };
  const ring = (p: readonly [number, number], n: [number, number]): number => {
    const first = b.positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      const phi = (TAU * j) / segments;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      vertex(
        b,
        [at[0] + p[0] * c, at[1] + p[1], at[2] + p[0] * s],
        [n[0] * c, n[1], n[0] * s],
        color,
      );
    }
    return first;
  };

  for (let s = 0; s < normals.length; s++) {
    const own = normals[s]!;
    const a = ring(points[s]!, smooth(s) ?? own);
    const c = ring(points[s + 1]!, smooth(s + 1) ?? own);
    for (let j = 0; j < segments; j++) {
      triangle(b, a + j, a + j + 1, c + j);
      triangle(b, a + j + 1, c + j + 1, c + j);
    }
  }
}

/** A cone with its top cut off, from one end to the other, with flat caps. */
function addFrustum(
  b: MeshBuilder,
  from: Vec,
  to: Vec,
  r0: number,
  r1: number,
  color: Rgb,
  segments: number,
): void {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const axis = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  const helper: Vec = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const p1 = unit(cross(axis, helper));
  const p2 = cross(axis, p1);
  const radial = (j: number): Vec => {
    const phi = (TAU * j) / segments;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    return [c * p1[0] + s * p2[0], c * p1[1] + s * p2[1], c * p1[2] + s * p2[2]];
  };
  const ring = (origin: Vec, radius: number, normal: (r: Vec) => Vec): number => {
    const first = b.positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      const r = radial(j);
      vertex(
        b,
        [origin[0] + r[0] * radius, origin[1] + r[1] * radius, origin[2] + r[2] * radius],
        normal(r),
        color,
      );
    }
    return first;
  };

  // The side normal tilts toward the narrower end.
  const slope = r0 - r1;
  const side = (r: Vec): Vec =>
    unit([
      r[0] * length + axis[0] * slope,
      r[1] * length + axis[1] * slope,
      r[2] * length + axis[2] * slope,
    ]);
  const a = ring(from, r0, side);
  const c = ring(to, r1, side);
  for (let j = 0; j < segments; j++) {
    triangle(b, a + j, a + j + 1, c + j);
    triangle(b, a + j + 1, c + j + 1, c + j);
  }

  const back: Vec = [-axis[0], -axis[1], -axis[2]];
  for (const [origin, radius, normal] of [
    [from, r0, back],
    [to, r1, axis],
  ] as const) {
    const centre = vertex(b, origin, normal, color);
    const first = ring(origin, radius, () => normal);
    for (let j = 0; j < segments; j++) triangle(b, centre, first + j, first + j + 1);
  }
}

/** An axis-aligned box with flat faces. */
export function addBox(b: MeshBuilder, center: Vec, size: Vec, color: Rgb): void {
  const half: Vec = [size[0] / 2, size[1] / 2, size[2] / 2];
  const faces: { n: Vec; u: Vec; v: Vec }[] = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  for (const { n, u, v } of faces) {
    const corner = (su: number, sv: number): number =>
      vertex(
        b,
        [
          center[0] + half[0] * (n[0] + su * u[0] + sv * v[0]),
          center[1] + half[1] * (n[1] + su * u[1] + sv * v[1]),
          center[2] + half[2] * (n[2] + su * u[2] + sv * v[2]),
        ],
        n,
        color,
      );
    const a = corner(-1, -1);
    const c = corner(1, -1);
    const d = corner(1, 1);
    const e = corner(-1, 1);
    triangle(b, a, c, d);
    triangle(b, a, d, e);
  }
}

/** Add a piece standing on y at (x, z). */
export function addPiece(
  b: MeshBuilder,
  kind: PieceKind,
  x: number,
  z: number,
  color: Rgb,
  y = 0,
): void {
  const { height, radius, segments } = PIECE_SPECS[kind];
  const at: Vec = [x, y, z];
  switch (kind) {
    case 'pawn':
      addLathe(b, PAWN, radius, height, at, color, segments);
      break;
    case 'rook':
      addLathe(b, ROOK, radius, height - 0.14, at, color, segments);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox(b, [x + sx * 0.14, y + height - 0.07, z + sz * 0.14], [0.11, 0.14, 0.11], color);
        }
      }
      break;
    case 'queen':
      addLathe(b, QUEEN, radius, height, at, color, segments);
      break;
    case 'king':
      addLathe(b, KING, radius, height - 0.35, at, color, segments);
      addBox(b, [x, y + height - 0.175, z], [0.07, 0.35, 0.07], color);
      addBox(b, [x, y + height - 0.13, z], [0.22, 0.07, 0.07], color);
      break;
    case 'knight': {
      addLathe(b, KNIGHT_BASE, radius, 0.5, at, color, segments);
      // The head is drawn in (forward, height, sideways) and faces -x.
      const p = (forward: number, h: number, side = 0): Vec => [x - forward, y + h, z + side];
      addFrustum(b, p(0, 0.46), p(-0.06, 0.88), 0.19, 0.15, color, 14);
      addFrustum(b, p(-0.04, 0.88), p(0.12, 0.97), 0.17, 0.15, color, 14);
      addFrustum(b, p(0.12, 0.97), p(0.34, 0.86), 0.13, 0.085, color, 12);
      for (const side of [-1, 1]) {
        addFrustum(
          b,
          p(-0.08, 1.02, side * 0.07),
          p(-0.1, 1.2, side * 0.07),
          0.055,
          0.012,
          color,
          8,
        );
      }
      break;
    }
  }
}
