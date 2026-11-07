/**
 * Bakes a point silhouette for the tree preset from a CC0 Poly Haven model.
 *
 * It downloads the model (cached in .starforge/cache), samples evenly spread points on the trunk,
 * the branches and the leaves separately, and writes them as a small generated TypeScript module.
 * The model never ships; only the sampled points do.
 *
 *   pnpm exec tsx scripts/bake-tree-silhouette.ts            # bake and write everything
 *   pnpm exec tsx scripts/bake-tree-silhouette.ts --inspect  # only print and save the model report
 *
 * Besides the data module it writes .starforge/silhouette/report.json and preview.png.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const MODEL_ID = 'jacaranda_tree';
const RESOLUTION = '1k';
const BASE_URL = `https://dl.polyhaven.org/file/ph-assets/Models/gltf/${RESOLUTION}/${MODEL_ID}/`;
const GLTF_FILE = `${MODEL_ID}_${RESOLUTION}.gltf`;
const USER_AGENT = 'starforge-bake (https://github.com/ShyneChikwapulo/Starforge)';

/** Points baked per part. Presets take a prefix, so any budget up to these gets an even subset. */
const COUNTS = { trunk: 1000, branches: 2400, leaves: 6000 };
const CANDIDATES_PER_POINT = 12;
/** Share of each part chosen blue-noise style; the rest keeps the model's own clumps and gaps. */
const EVEN_SHARE = 0.65;
const SEED = 7;
const QUANT = 16384;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.starforge', 'cache', MODEL_ID);
const REPORT = join(ROOT, '.starforge', 'silhouette', 'report.json');
const PREVIEW = join(ROOT, '.starforge', 'silhouette', 'preview.png');
const OUTPUT = join(ROOT, 'packages', 'presets', 'src', 'tree-silhouette-data.ts');

type Kind = 'trunk' | 'branches' | 'leaves';
const KINDS: Kind[] = ['trunk', 'branches', 'leaves'];

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteStride?: number;
}
interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}
interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface Gltf {
  asset?: { generator?: string };
  extensionsRequired?: string[];
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: Primitive[] }[];
  materials?: { name?: string }[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  buffers?: { uri?: string }[];
}

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

async function download(url: string, target: string): Promise<void> {
  if (existsSync(target)) return;
  console.log(`downloading ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function loadModel(): Promise<{ gltf: Gltf; buffers: Buffer[] }> {
  const gltfPath = join(CACHE, GLTF_FILE);
  await download(BASE_URL + GLTF_FILE, gltfPath);
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8')) as Gltf;
  const unsupported = (gltf.extensionsRequired ?? []).filter((e) =>
    /draco|meshopt|quantization/i.test(e),
  );
  if (unsupported.length > 0) throw new Error(`Unsupported glTF extensions: ${unsupported}`);

  const buffers: Buffer[] = [];
  for (const entry of gltf.buffers ?? []) {
    if (!entry.uri) throw new Error('Embedded GLB buffers are not supported');
    if (entry.uri.startsWith('data:')) {
      buffers.push(Buffer.from(entry.uri.split(',')[1] ?? '', 'base64'));
    } else {
      const path = join(CACHE, entry.uri);
      await download(BASE_URL + entry.uri, path);
      buffers.push(await readFile(path));
    }
  }
  return { gltf, buffers };
}

const SIZES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf: Gltf, buffers: Buffer[], index: number): Float64Array {
  const accessor = gltf.accessors?.[index];
  if (!accessor) throw new Error(`Missing accessor ${index}`);
  const width = WIDTHS[accessor.type] ?? 1;
  const size = SIZES[accessor.componentType];
  if (!size) throw new Error(`Unsupported component type ${accessor.componentType}`);
  const out = new Float64Array(accessor.count * width);
  if (accessor.bufferView === undefined) return out;
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Missing buffer view ${accessor.bufferView}`);
  const data = buffers[view.buffer];
  if (!data) throw new Error(`Missing buffer ${view.buffer}`);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const stride = view.byteStride ?? size * width;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (offset: number): number => {
    switch (accessor.componentType) {
      case 5120:
        return dv.getInt8(offset);
      case 5121:
        return dv.getUint8(offset);
      case 5122:
        return dv.getInt16(offset, true);
      case 5123:
        return dv.getUint16(offset, true);
      case 5125:
        return dv.getUint32(offset, true);
      default:
        return dv.getFloat32(offset, true);
    }
  };
  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < width; j++) out[i * width + j] = read(base + i * stride + j * size);
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 product a * b. */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function localMatrix(node: GltfNode): number[] {
  if (node.matrix) return node.matrix;
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]; // prettier-ignore
}

function classify(name: string): Kind | null {
  const lower = name.toLowerCase();
  if (/leaf|leaves|foliage/.test(lower)) return 'leaves';
  if (/trunk|bark/.test(lower)) return 'trunk';
  if (/branch|twig/.test(lower)) return 'branches';
  return null;
}

interface Collected {
  tris: Record<Kind, number[]>;
  materials: Map<string, { kind: Kind | null; triangles: number }>;
  nodes: number;
}

/** World-space triangles (9 numbers each) grouped by what the material says they are. */
function collect(gltf: Gltf, buffers: Buffer[]): Collected {
  const tris: Record<Kind, number[]> = { trunk: [], branches: [], leaves: [] };
  const materials = new Map<string, { kind: Kind | null; triangles: number }>();
  let nodes = 0;

  const visit = (index: number, parent: number[]): void => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    nodes++;
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const position = primitive.attributes.POSITION;
        if (position === undefined) continue;
        const name = gltf.materials?.[primitive.material ?? -1]?.name ?? 'unnamed';
        const kind = classify(name);
        const stats = materials.get(name) ?? { kind, triangles: 0 };
        materials.set(name, stats);

        const points = readAccessor(gltf, buffers, position);
        const indices =
          primitive.indices !== undefined ? readAccessor(gltf, buffers, primitive.indices) : null;
        const count = Math.floor((indices ? indices.length : points.length / 3) / 3);
        stats.triangles += count;
        if (!kind) continue;
        const target = tris[kind];
        for (let t = 0; t < count; t++) {
          for (let v = 0; v < 3; v++) {
            const vi = indices ? indices[t * 3 + v]! : t * 3 + v;
            const x = points[vi * 3]!;
            const y = points[vi * 3 + 1]!;
            const z = points[vi * 3 + 2]!;
            target.push(
              world[0]! * x + world[4]! * y + world[8]! * z + world[12]!,
              world[1]! * x + world[5]! * y + world[9]! * z + world[13]!,
              world[2]! * x + world[6]! * y + world[10]! * z + world[14]!,
            );
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY);
  return { tris, materials, nodes };
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
 * Pick `want` points so that every prefix is an even subset: progressive dart throwing with a
 * shrinking exclusion radius, then the remainder in random order so the model's clumps survive.
 */
function spread(points: Float32Array, want: number): Float32Array {
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

  const out = new Float32Array(Math.min(want, order.length) * 3);
  for (let i = 0; i < out.length / 3; i++) {
    const source = order[i]!;
    out[i * 3] = points[source * 3]!;
    out[i * 3 + 1] = points[source * 3 + 1]!;
    out[i * 3 + 2] = points[source * 3 + 2]!;
  }
  return out;
}

function pack(points: Float32Array): string {
  const buffer = Buffer.alloc(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    const q = Math.max(-32767, Math.min(32767, Math.round(points[i]! * QUANT)));
    buffer.writeInt16LE(q, i * 2);
  }
  return buffer.toString('base64');
}

function lines(text: string): string {
  return (text.match(/.{1,92}/g) ?? []).map((chunk) => `    '${chunk}',`).join('\n');
}

function renderModule(sets: Record<Kind, Float32Array>): string {
  const part = (kind: Kind): string => `  ${kind}: [\n${lines(pack(sets[kind]))}\n  ].join(''),`;
  return `// Generated by scripts/bake-tree-silhouette.ts. Do not edit by hand.
//
// Point silhouette sampled from "Jacaranda Tree" by Rob Tuytel and Rico Cilliers (Poly Haven, CC0):
// https://polyhaven.com/a/jacaranda_tree
//
// Points are in model units: the tree is 1 tall, its base sits at the origin and y points up.
// Each part is int16 little-endian triples (value / ${QUANT}) as base64, ordered so that any
// prefix is an evenly spread subset of the whole.

export const SILHOUETTE_QUANT = ${QUANT};

export const silhouetteData = {
${part('trunk')}
${part('branches')}
${part('leaves')}
};
`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Front and side views side by side, so the silhouette can be judged without any preset code. */
async function writePreview(sets: Record<Kind, Float32Array>): Promise<void> {
  const panel = 560;
  const height = 600;
  const pad = 24;
  const width = panel * 2;
  let half = 0.01;
  for (const kind of KINDS) {
    const points = sets[kind];
    for (let i = 0; i < points.length; i += 3) {
      half = Math.max(half, Math.abs(points[i]!), Math.abs(points[i + 2]!));
    }
  }
  const scale = Math.min(height - 2 * pad, (panel / 2 - pad) / half);
  const colours: Record<Kind, number[]> = {
    trunk: [0.8, 0.45, 0.25],
    branches: [1, 0.75, 0.4],
    leaves: [0.25, 1, 0.45],
  };
  const accumulator = new Float32Array(width * height * 3);
  const splat = (px: number, py: number, colour: number[]): void => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = Math.round(px) + dx;
        const y = Math.round(py) + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        for (let k = 0; k < 3; k++) accumulator[(y * width + x) * 3 + k]! += colour[k]! * 0.3;
      }
    }
  };
  for (const kind of KINDS) {
    const points = sets[kind];
    for (let i = 0; i < points.length; i += 3) {
      const py = height - pad - points[i + 1]! * scale;
      splat(panel / 2 + points[i]! * scale, py, colours[kind]);
      splat(panel + panel / 2 + points[i + 2]! * scale, py, colours[kind]);
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  const background = [6, 9, 20];
  for (let i = 0; i < rgb.length; i++) {
    const glow = 1 - Math.exp(-accumulator[i]! * 1.4);
    rgb[i] = Math.round(background[i % 3]! + (255 - background[i % 3]!) * glow);
  }
  await mkdir(dirname(PREVIEW), { recursive: true });
  await writeFile(PREVIEW, encodePng(width, height, rgb));
}

function profile(sets: Record<Kind, Float32Array>): unknown[] {
  const bands = 10;
  return Array.from({ length: bands }, (_, band) => {
    const row: Record<string, unknown> = {
      y: `${(band / bands).toFixed(1)}-${((band + 1) / bands).toFixed(1)}`,
    };
    for (const kind of KINDS) {
      const points = sets[kind];
      let count = 0;
      let reach = 0;
      for (let i = 0; i < points.length; i += 3) {
        if (Math.min(bands - 1, Math.floor(points[i + 1]! * bands)) !== band) continue;
        count++;
        reach = Math.max(reach, Math.hypot(points[i]!, points[i + 2]!));
      }
      row[kind] = { count, reach: Number(reach.toFixed(3)) };
    }
    return row;
  });
}

async function main(): Promise<void> {
  const inspectOnly = process.argv.includes('--inspect');
  const { gltf, buffers } = await loadModel();
  const { tris, materials, nodes } = collect(gltf, buffers);

  const raw = boundsOf(KINDS.map((kind) => tris[kind]));
  const size = raw.max.map((value, k) => value - raw.min[k]!);
  const report: Record<string, unknown> = {
    model: MODEL_ID,
    generator: gltf.asset?.generator,
    nodes,
    materials: [...materials].map(([name, stats]) => ({ name, ...stats })),
    triangles: Object.fromEntries(KINDS.map((kind) => [kind, tris[kind].length / 9])),
    rawBounds: { min: raw.min, max: raw.max, size },
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  const missing = KINDS.filter((kind) => tris[kind].length === 0);
  if (missing.length > 0) {
    throw new Error(
      `No triangles for: ${missing.join(', ')}. Material names found: ${[...materials.keys()].join(', ')}. See ${REPORT}.`,
    );
  }
  if (inspectOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Normalise: the tree is 1 tall, its trunk base sits at the origin, y is up.
  const height = size[1]!;
  const trunkBounds = boundsOf([tris.trunk]);
  const base = { x: 0, z: 0, n: 0 };
  for (let i = 0; i < tris.trunk.length; i += 3) {
    if (tris.trunk[i + 1]! > trunkBounds.min[1]! + 0.05 * height) continue;
    base.x += tris.trunk[i]!;
    base.z += tris.trunk[i + 2]!;
    base.n++;
  }
  const cx = base.n > 0 ? base.x / base.n : (raw.min[0]! + raw.max[0]!) / 2;
  const cz = base.n > 0 ? base.z / base.n : (raw.min[2]! + raw.max[2]!) / 2;
  for (const kind of KINDS) {
    const array = tris[kind];
    for (let i = 0; i < array.length; i += 3) {
      array[i] = (array[i]! - cx) / height;
      array[i + 1] = (array[i + 1]! - raw.min[1]!) / height;
      array[i + 2] = (array[i + 2]! - cz) / height;
    }
  }

  const rng = createRng(SEED);
  const sets = {} as Record<Kind, Float32Array>;
  for (const kind of KINDS) {
    const want = COUNTS[kind];
    sets[kind] = spread(sampleSurface(tris[kind], want * CANDIDATES_PER_POINT, rng), want);
    console.log(`${kind}: ${sets[kind].length / 3} points`);
  }

  report.sampled = Object.fromEntries(KINDS.map((kind) => [kind, sets[kind].length / 3]));
  report.normalisedProfile = profile(sets);
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(OUTPUT, renderModule(sets));
  await writePreview(sets);
  console.log(`wrote ${OUTPUT}`);
  console.log(`wrote ${PREVIEW}`);
  console.log(`wrote ${REPORT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
