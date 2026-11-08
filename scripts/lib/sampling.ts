export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Area-weighted uniform points on a triangle soup (9 numbers per triangle). */
export function sampleSurface(tris: number[], count: number, rng: () => number): Float32Array {
  const n = tris.length / 9;
  const cumulative = new Float64Array(n);
  let total = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ux = tris[o + 3]! - tris[o]!;
    const uy = tris[o + 4]! - tris[o + 1]!;
    const uz = tris[o + 5]! - tris[o + 2]!;
    const vx = tris[o + 6]! - tris[o]!;
    const vy = tris[o + 7]! - tris[o + 1]!;
    const vz = tris[o + 8]! - tris[o + 2]!;
    total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    cumulative[t] = total;
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const target = rng() * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    const o = lo * 9;
    const r1 = Math.sqrt(rng());
    const r2 = rng();
    const a = 1 - r1;
    const b = r1 * (1 - r2);
    const c = r1 * r2;
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] = a * tris[o + k]! + b * tris[o + 3 + k]! + c * tris[o + 6 + k]!;
    }
  }
  return out;
}

/**
 * Pick the indices of `want` points so that every prefix is an even subset: progressive dart
 * throwing with a shrinking exclusion radius (points are in a box about 1 across), then the rest
 * in random order so the model's own clumps survive. `evenShare` is the blue-noise part.
 */
export function spread(points: Float32Array, want: number, evenShare = 0.65): number[] {
  const n = points.length / 3;
  const evenTarget = Math.floor(want * evenShare);
  const taken = new Uint8Array(n);
  const order: number[] = [];
  let radius = 0.08;

  while (order.length < evenTarget && radius > 0.0015) {
    const r = radius;
    const r2 = r * r;
    const cell = (v: number): number => Math.floor(v / r);
    const key = (ix: number, iy: number, iz: number): number =>
      ((ix + 2048) * 4096 + (iy + 2048)) * 4096 + (iz + 2048);
    const grid = new Map<number, number[]>();
    const insert = (i: number): void => {
      const k = key(cell(points[i * 3]!), cell(points[i * 3 + 1]!), cell(points[i * 3 + 2]!));
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    };
    const blocked = (i: number): boolean => {
      const x = points[i * 3]!;
      const y = points[i * 3 + 1]!;
      const z = points[i * 3 + 2]!;
      const ix = cell(x);
      const iy = cell(y);
      const iz = cell(z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const list = grid.get(key(ix + dx, iy + dy, iz + dz));
            if (!list) continue;
            for (const j of list) {
              const ex = points[j * 3]! - x;
              const ey = points[j * 3 + 1]! - y;
              const ez = points[j * 3 + 2]! - z;
              if (ex * ex + ey * ey + ez * ez < r2) return true;
            }
          }
        }
      }
      return false;
    };

    for (const i of order) insert(i);
    for (let i = 0; i < n && order.length < evenTarget; i++) {
      if (taken[i] || blocked(i)) continue;
      taken[i] = 1;
      order.push(i);
      insert(i);
    }
    radius *= 0.85;
  }
  for (let i = 0; i < n && order.length < want; i++) {
    if (!taken[i]) {
      taken[i] = 1;
      order.push(i);
    }
  }
  return order.slice(0, want);
}

/** Pack values as little-endian int16 (value * scale) in base64. */
export function pack16(values: ArrayLike<number>, scale: number): string {
  const buffer = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(values[i]! * scale))), i * 2);
  }
  return buffer.toString('base64');
}

/** Split base64 into quoted, indented source lines of at most 92 characters. */
export function lines(text: string): string {
  return (text.match(/.{1,92}/g) ?? []).map((chunk) => `    '${chunk}',`).join('\n');
}
