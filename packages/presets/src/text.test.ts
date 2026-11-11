import type { SolidMesh } from '@starforge/core';
import { describe, expect, it } from 'vitest';
import { buildTextMesh, measureText } from './text';

const COLOR: [number, number, number] = [0.2, 0.8, 0.3];
const base = { size: 1, depth: 0.2, color: COLOR };
const SAMPLE = 'Starforge 2026 %@&';

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

/** Share of outline points whose wall normal differs between the two edges that meet there. */
function creaseShare(crease?: number): number {
  const { mesh } = buildTextMesh('O', { ...base, ...(crease === undefined ? {} : { crease }) });
  const seen = new Map<string, Set<string>>();
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    if (mesh.normals[i * 3 + 2] !== 0) continue;
    const at = `${mesh.positions[i * 3]!.toFixed(5)},${mesh.positions[i * 3 + 1]!.toFixed(5)}`;
    const normal = `${mesh.normals[i * 3]!.toFixed(4)},${mesh.normals[i * 3 + 1]!.toFixed(4)}`;
    const set = seen.get(at) ?? new Set<string>();
    set.add(normal);
    seen.set(at, set);
  }
  return [...seen.values()].filter((set) => set.size > 1).length / seen.size;
}

describe('measureText', () => {
  it('is zero for no text', () => {
    expect(measureText('', { size: 1 })).toEqual({ width: 0, missing: [] });
  });

  it('grows in proportion to size', () => {
    const one = measureText('Starforge', { size: 1 }).width;
    expect(measureText('Starforge', { size: 2 }).width).toBeCloseTo(one * 2, 6);
  });

  it('gives wide letters more room than narrow ones', () => {
    expect(measureText('WWW', { size: 1 }).width).toBeGreaterThan(
      measureText('iii', { size: 1 }).width,
    );
  });

  it('adds letter spacing between letters only', () => {
    const plain = measureText('abc', { size: 1 }).width;
    const spaced = measureText('abc', { size: 1, letterSpacing: 0.1 }).width;
    expect(spaced - plain).toBeCloseTo(0.2, 6);
  });

  it('lists each missing character once and measures it as a question mark', () => {
    const odd = measureText('é€é', { size: 1 });
    expect(odd.missing).toEqual(['é', '€']);
    expect(odd.width).toBeCloseTo(measureText('???', { size: 1 }).width, 6);
  });
});

describe('buildTextMesh', () => {
  it('builds a well-formed mesh', () => {
    const { mesh } = buildTextMesh(SAMPLE, base);
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
    expect(worst).toBeLessThan(1e-5);
  });

  it('is deterministic', () => {
    const a = buildTextMesh(SAMPLE, base).mesh;
    const b = buildTextMesh(SAMPLE, base).mesh;
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it('uses the colour it is given', () => {
    const { mesh } = buildTextMesh('Hi', base);
    for (let i = 0; i < mesh.colors.length; i += 3) {
      expect(Array.from(mesh.colors.slice(i, i + 3))).toEqual(COLOR.map(Math.fround));
    }
  });

  it('puts the baseline at y = 0 and a capital letter one size tall', () => {
    const { min, max } = bounds(buildTextMesh('H', { ...base, size: 2 }).mesh);
    expect(min[1]).toBeCloseTo(0, 2);
    expect(max[1]).toBeCloseTo(2, 2);
  });

  it('can centre a capital letter on y = 0 instead', () => {
    const { min, max } = bounds(buildTextMesh('H', { ...base, size: 2, anchor: 'middle' }).mesh);
    expect(min[1]).toBeCloseTo(-1, 2);
    expect(max[1]).toBeCloseTo(1, 2);
  });

  it('is as thick as asked and centred on z = 0', () => {
    const { min, max } = bounds(buildTextMesh('H', { ...base, depth: 0.3 }).mesh);
    expect(min[2]).toBeCloseTo(-0.15, 5);
    expect(max[2]).toBeCloseTo(0.15, 5);
  });

  it('aligns left, centre and right around x = 0', () => {
    const width = measureText('HHH', base).width;
    const left = buildTextMesh('HHH', base);
    const centre = buildTextMesh('HHH', { ...base, align: 'center' });
    const right = buildTextMesh('HHH', { ...base, align: 'right' });
    expect(left.width).toBeCloseTo(width, 6);

    const l = bounds(left.mesh);
    expect(l.min[0]).toBeGreaterThanOrEqual(0);
    expect(l.max[0]).toBeLessThanOrEqual(width + 1e-6);
    const c = bounds(centre.mesh);
    expect(c.min[0]).toBeGreaterThanOrEqual(-width / 2 - 1e-6);
    expect(c.max[0]).toBeLessThanOrEqual(width / 2 + 1e-6);
    const r = bounds(right.mesh);
    expect(r.min[0]).toBeGreaterThanOrEqual(-width - 1e-6);
    expect(r.max[0]).toBeLessThanOrEqual(1e-6);
  });

  it('gives the front and the back the same number of triangles', () => {
    const { mesh } = buildTextMesh(SAMPLE, base);
    let front = 0;
    let back = 0;
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const nz = mesh.normals[mesh.indices[k]! * 3 + 2]!;
      if (nz === -1) front++;
      else if (nz === 1) back++;
    }
    expect(front).toBeGreaterThan(0);
    expect(front).toBe(back);
  });

  it('winds every triangle to agree with its normals', () => {
    const { mesh } = buildTextMesh(SAMPLE, base);
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
      const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const normal = (axis: number): number =>
        mesh.normals[a * 3 + axis]! + mesh.normals[b * 3 + axis]! + mesh.normals[c * 3 + axis]!;
      worst = Math.min(
        worst,
        cross[0]! * normal(0) + cross[1]! * normal(1) + cross[2]! * normal(2),
      );
    }
    // A wrongly wound triangle gives a clearly negative value; a sliver of no area gives zero.
    expect(worst).toBeGreaterThan(-1e-6);
  });

  it('keeps the corners of an H sharp', () => {
    const { mesh } = buildTextMesh('H', base);
    let walls = 0;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (mesh.normals[i + 2] !== 0) continue;
      walls++;
      expect(Math.max(Math.abs(mesh.normals[i]!), Math.abs(mesh.normals[i + 1]!))).toBeGreaterThan(
        0.999,
      );
    }
    expect(walls).toBeGreaterThan(0);
  });

  it('shades the curve of an O smoothly, and sharply when the crease angle is 0', () => {
    expect(creaseShare()).toBeLessThan(0.05);
    expect(creaseShare(0)).toBeGreaterThan(0.9);
  });

  it('draws characters it does not have as a question mark and reports them', () => {
    const odd = buildTextMesh('é', base);
    const mark = buildTextMesh('?', base);
    expect(odd.missing).toEqual(['é']);
    expect(Array.from(odd.mesh.positions)).toEqual(Array.from(mark.mesh.positions));
  });

  it('builds an empty mesh for an empty string', () => {
    const { mesh, width } = buildTextMesh('', base);
    expect(width).toBe(0);
    expect(mesh.positions).toHaveLength(0);
    expect(mesh.indices).toHaveLength(0);
  });
});
