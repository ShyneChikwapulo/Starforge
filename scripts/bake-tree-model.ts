/**
 * Bakes the tree preset's geometry from a local glTF model. The wood becomes a solid triangle
 * mesh (welded, with smooth normals) and the leaves become an evenly spread point set that the
 * preset turns into foliage particles. Only the baked result is committed, never the model.
 *
 *   pnpm exec tsx scripts/bake-tree-model.ts [model.gltf] [--ground-y <number>]
 *
 * The default model is .starforge/models/stylized-tree/scene.gltf. Materials are sorted by name:
 * trunk, bark and branch become wood, leaf and leaves become foliage, anything else (ground,
 * grass) is dropped. Wood below the ground height is cut, so a buried base does not show.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MODEL = join(ROOT, '.starforge', 'models', 'stylized-tree', 'scene.gltf');
const OUTPUT = join(ROOT, 'packages', 'presets', 'src', 'tree-silhouette-data.ts');
const REPORT = join(ROOT, '.starforge', 'silhouette', 'report.json');

/** Top of the model's ground mound, in model units. Wood below this is buried and is cut. */
const GROUND_Y = -0.49;
const LEAF_POINTS = 14000;
const CANDIDATES_PER_POINT = 12;
/** Share of the leaf points chosen blue-noise style; the rest keeps the model's own clumps. */
const EVEN_SHARE = 0.65;
const MAX_WOOD_TRIANGLES = 60000;
const SEED = 7;
const QUANT = 30000;
const NORMAL_QUANT = 127;

const SIZES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const MAXIMUM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

type Part = 'wood' | 'leaves';

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function load(path: string): Promise<{ gltf: Json; buffers: Buffer[] }> {
  const data = await readFile(path);
  if (data.readUInt32LE(0) === 0x46546c67) {
    let gltf: Json;
    let bin = Buffer.alloc(0);
    for (let offset = 12; offset < data.length;) {
      const length = data.readUInt32LE(offset);
      const type = data.readUInt32LE(offset + 4);
      const chunk = data.subarray(offset + 8, offset + 8 + length);
      if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8'));
      else if (type === 0x004e4942) bin = chunk;
      offset += 8 + length;
    }
    return { gltf, buffers: [bin] };
  }
  const gltf = JSON.parse(data.toString('utf8'));
  const unsupported = (gltf.extensionsRequired ?? []).filter((e: string) =>
    /draco|meshopt/i.test(e),
  );
  if (unsupported.length > 0) throw new Error(`Unsupported glTF extensions: ${unsupported}`);
  const buffers: Buffer[] = [];
  for (const entry of gltf.buffers ?? []) {
    buffers.push(
      entry.uri.startsWith('data:')
        ? Buffer.from(entry.uri.split(',')[1], 'base64')
        : await readFile(join(dirname(path), decodeURIComponent(entry.uri))),
    );
  }
  return { gltf, buffers };
}

function readAccessor(gltf: Json, buffers: Buffer[], index: number): Float64Array {
  const accessor = gltf.accessors[index];
  const width = WIDTHS[accessor.type] ?? 1;
  const size = SIZES[accessor.componentType];
  const out = new Float64Array(accessor.count * width);
  if (accessor.bufferView === undefined) return out;
  const view = gltf.bufferViews[accessor.bufferView];
  const data = buffers[view.buffer];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const stride = view.byteStride ?? size * width;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const scale = accessor.normalized ? 1 / (MAXIMUM[accessor.componentType] ?? 1) : 1;
  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < width; j++) {
      const o = base + i * stride + j * size;
      let v: number;
      switch (accessor.componentType) {
        case 5120:
          v = dv.getInt8(o);
          break;
        case 5121:
          v = dv.getUint8(o);
          break;
        case 5122:
          v = dv.getInt16(o, true);
          break;
        case 5123:
          v = dv.getUint16(o, true);
          break;
        case 5125:
          v = dv.getUint32(o, true);
          break;
        default:
          v = dv.getFloat32(o, true);
      }
      out[i * width + j] = v * scale;
    }
  }
  return out;
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

function localMatrix(node: Json): number[] {
  if (node.matrix) return node.matrix;
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const xx = qx * qx,
    yy = qy * qy,
    zz = qz * qz,
    xy = qx * qy,
    xz = qx * qz,
    yz = qy * qz;
  const wx = qw * qx,
    wy = qw * qy,
    wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]; // prettier-ignore
}

function classify(name: string): Part | null {
  const lower = name.toLowerCase();
  if (/leaf|leaves|foliage/.test(lower)) return 'leaves';
  if (/trunk|bark|branch|wood/.test(lower)) return 'wood';
  return null;
}

/** World-space triangle soup (9 numbers per triangle) per part. Other materials are counted and dropped. */
function collect(gltf: Json, buffers: Buffer[]) {
  const soup: Record<Part, number[]> = { wood: [], leaves: [] };
  const ignored = new Map<string, number>();

  const visit = (index: number, parent: number[]): void => {
    const node = gltf.nodes[index];
    const m = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives as Json[]) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const name: string = gltf.materials?.[primitive.material]?.name ?? 'unnamed';
        const part = classify(name);
        if (!part) {
          const source = primitive.indices ?? primitive.attributes.POSITION;
          ignored.set(name, (ignored.get(name) ?? 0) + gltf.accessors[source].count / 3);
          continue;
        }
        const positions = readAccessor(gltf, buffers, primitive.attributes.POSITION);
        const indices =
          primitive.indices !== undefined ? readAccessor(gltf, buffers, primitive.indices) : null;
        const count = Math.floor((indices ? indices.length : positions.length / 3) / 3);
        const target = soup[part];
        for (let t = 0; t < count * 3; t++) {
          const v = indices ? indices[t]! : t;
          const x = positions[v * 3]!;
          const y = positions[v * 3 + 1]!;
          const z = positions[v * 3 + 2]!;
          target.push(
            m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
          );
        }
      }
    }
    for (const child of node.children ?? []) visit(child, m);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY);
  return { soup, ignored };
}

function boundsOf(arrays: number[][]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const array of arrays) {
    for (let i = 0; i < array.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const value = array[i + k]!;
        if (value < min[k]!) min[k] = value;
        if (value > max[k]!) max[k] = value;
      }
    }
  }
  return { min, max };
}

/** Weld vertices that share a position and give each a smooth, area-weighted normal. */
function buildMesh(soup: number[], step: number) {
  const ids = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  const corner = (o: number): number => {
    const key = `${Math.round(soup[o]! / step)},${Math.round(soup[o + 1]! / step)},${Math.round(soup[o + 2]! / step)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      ids.set(key, id);
      positions.push(soup[o]!, soup[o + 1]!, soup[o + 2]!);
    }
    return id;
  };
  for (let t = 0; t < soup.length; t += 9) {
    const a = corner(t);
    const b = corner(t + 3);
    const c = corner(t + 6);
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }

  const sums = new Float64Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    const ux = positions[b * 3]! - positions[a * 3]!;
    const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const vx = positions[c * 3]! - positions[a * 3]!;
    const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      sums[v * 3] += nx;
      sums[v * 3 + 1] += ny;
      sums[v * 3 + 2] += nz;
    }
  }
  const normals = new Float32Array(positions.length);
  for (let v = 0; v < positions.length / 3; v++) {
    const length = Math.hypot(sums[v * 3]!, sums[v * 3 + 1]!, sums[v * 3 + 2]!);
    normals[v * 3] = length > 0 ? sums[v * 3]! / length : 0;
    normals[v * 3 + 1] = length > 0 ? sums[v * 3 + 1]! / length : 1;
    normals[v * 3 + 2] = length > 0 ? sums[v * 3 + 2]! / length : 0;
  }
  return { positions: Float32Array.from(positions), normals, indices: Uint32Array.from(indices) };
}

/** Area-weighted uniform points on a triangle soup. */
function sampleSurface(tris: number[], count: number, rng: () => number): Float32Array {
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
 * throwing with a shrinking exclusion radius, then the rest in random order so clumps survive.
 */
function spread(points: Float32Array, want: number): number[] {
  const n = points.length / 3;
  const evenTarget = Math.floor(want * EVEN_SHARE);
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

function pack16(values: ArrayLike<number>, scale: number): string {
  const buffer = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(values[i]! * scale))), i * 2);
  }
  return buffer.toString('base64');
}

function packNormals(values: Float32Array): string {
  const buffer = Buffer.alloc(values.length);
  for (let i = 0; i < values.length; i++) {
    buffer.writeInt8(Math.max(-127, Math.min(127, Math.round(values[i]! * NORMAL_QUANT))), i);
  }
  return buffer.toString('base64');
}

function packIndices(values: Uint32Array, bytes: 2 | 4): string {
  const buffer = Buffer.alloc(values.length * bytes);
  for (let i = 0; i < values.length; i++) {
    if (bytes === 2) buffer.writeUInt16LE(values[i]!, i * 2);
    else buffer.writeUInt32LE(values[i]!, i * 4);
  }
  return buffer.toString('base64');
}

function lines(text: string): string {
  return (text.match(/.{1,92}/g) ?? []).map((chunk) => `    '${chunk}',`).join('\n');
}

function renderModule(parts: Record<string, string>, indexBytes: number): string {
  const entry = (name: string): string => `  ${name}: [\n${lines(parts[name]!)}\n  ].join(''),`;
  return `// Generated by scripts/bake-tree-model.ts. Do not edit by hand.
//
// This work is based on "Stylized Tree"
// (https://sketchfab.com/3d-models/stylized-tree-2a00182b3ca4403da3f9e157184e4b42)
// by Daniel (https://sketchfab.com/danielpetrov)
// licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
//
// Changes: the ground and grass were removed, the buried base of the trunk was cut, the model was
// rescaled, its wood was re-meshed (vertices welded, smooth normals) and its leaves were
// resampled as an evenly spread point set.
//
// Units: the tree is 1 tall, its base sits at the origin and y points up. Vertex and leaf
// positions are int16 little-endian triples (value / ${QUANT}), normals are int8 triples
// (value / ${NORMAL_QUANT}) and mesh indices are unsigned little-endian, all as base64. Any
// prefix of the leaf points is an evenly spread subset of the whole.

export const SILHOUETTE_QUANT = ${QUANT};
export const NORMAL_QUANT = ${NORMAL_QUANT};
export const MESH_INDEX_BYTES = ${indexBytes};

export const silhouetteData = {
${entry('positions')}
${entry('normals')}
${entry('indices')}
${entry('leaves')}
};
`;
}

/** Clip a triangle soup to y >= minY, so the cut is a flat plane instead of a ragged edge. */
function clipAbove(soup: number[], minY: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < soup.length; t += 9) {
    const kept: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const a = [soup[t + i * 3]!, soup[t + i * 3 + 1]!, soup[t + i * 3 + 2]!];
      const j = (i + 1) % 3;
      const b = [soup[t + j * 3]!, soup[t + j * 3 + 1]!, soup[t + j * 3 + 2]!];
      const aIn = a[1]! >= minY;
      const bIn = b[1]! >= minY;
      if (aIn) kept.push(a);
      if (aIn !== bIn) {
        const f = (minY - a[1]!) / (b[1]! - a[1]!);
        kept.push([a[0]! + (b[0]! - a[0]!) * f, minY, a[2]! + (b[2]! - a[2]!) * f]);
      }
    }
    for (let i = 1; i + 1 < kept.length; i++) {
      for (const p of [kept[0]!, kept[i]!, kept[i + 1]!]) out.push(p[0]!, p[1]!, p[2]!);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--ground-y');
  const groundY = flag >= 0 ? Number(args[flag + 1]) : GROUND_Y;
  const input = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--ground-y');
  const modelPath = input ? resolve(input) : DEFAULT_MODEL;

  const { gltf, buffers } = await load(modelPath);
  const { soup, ignored } = collect(gltf, buffers);
  if (soup.wood.length === 0 || soup.leaves.length === 0) {
    throw new Error(
      `Need both wood and leaves. Wood: ${soup.wood.length / 9} triangles, leaves: ${soup.leaves.length / 9}. Dropped materials: ${[...ignored.keys()].join(', ')}`,
    );
  }

  // Cut the buried part of the wood with a clean, flat plane.
  const wood = clipAbove(soup.wood, groundY);
  if (wood.length / 9 > MAX_WOOD_TRIANGLES) {
    throw new Error(
      `${wood.length / 9} wood triangles is too many; the limit is ${MAX_WOOD_TRIANGLES}.`,
    );
  }
  const leaves = soup.leaves;

  // Normalise: 1 tall from the ground to the highest leaf, trunk base at the origin, y up.
  const bounds = boundsOf([wood, leaves]);
  const height = bounds.max[1]! - groundY;
  let sumX = 0;
  let sumZ = 0;
  let near = 0;
  for (let i = 0; i < wood.length; i += 3) {
    if (wood[i + 1]! > groundY + 0.06 * height) continue;
    sumX += wood[i]!;
    sumZ += wood[i + 2]!;
    near++;
  }
  const cx = near > 0 ? sumX / near : (bounds.min[0]! + bounds.max[0]!) / 2;
  const cz = near > 0 ? sumZ / near : (bounds.min[2]! + bounds.max[2]!) / 2;
  for (const array of [wood, leaves]) {
    for (let i = 0; i < array.length; i += 3) {
      array[i] = (array[i]! - cx) / height;
      array[i + 1] = (array[i + 1]! - groundY) / height;
      array[i + 2] = (array[i + 2]! - cz) / height;
    }
  }

  const mesh = buildMesh(wood, 1e-5);
  const rng = createRng(SEED);
  const sampled = sampleSurface(leaves, LEAF_POINTS * CANDIDATES_PER_POINT, rng);
  const chosen = spread(sampled, LEAF_POINTS);
  const leafPoints = new Float32Array(chosen.length * 3);
  chosen.forEach((source, i) => {
    for (let k = 0; k < 3; k++) leafPoints[i * 3 + k] = sampled[source * 3 + k]!;
  });

  const vertexCount = mesh.positions.length / 3;
  const indexBytes = vertexCount <= 65535 ? 2 : 4;
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(
    OUTPUT,
    renderModule(
      {
        positions: pack16(mesh.positions, QUANT),
        normals: packNormals(mesh.normals),
        indices: packIndices(mesh.indices, indexBytes),
        leaves: pack16(leafPoints, QUANT),
      },
      indexBytes,
    ),
  );

  let reach = 0;
  for (let i = 0; i < leafPoints.length; i += 3) {
    reach = Math.max(reach, Math.hypot(leafPoints[i]!, leafPoints[i + 2]!));
  }
  const meshBounds = boundsOf([Array.from(mesh.positions)]);
  const report = {
    model: modelPath,
    groundY,
    rawHeight: height,
    wood: { triangles: mesh.indices.length / 3, vertices: vertexCount, indexBytes },
    leaves: { points: leafPoints.length / 3, reach: Number(reach.toFixed(3)) },
    ignoredMaterials: Object.fromEntries(ignored),
    meshBounds: {
      min: meshBounds.min.map((v) => Number(v.toFixed(3))),
      max: meshBounds.max.map((v) => Number(v.toFixed(3))),
    },
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
