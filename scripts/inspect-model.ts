/**
 * Reports the structure of a local glTF or GLB: nodes, meshes, materials, triangle counts and
 * the connected pieces of geometry, so a tree can be split into wood and foliage.
 *
 *   pnpm exec tsx scripts/inspect-model.ts .starforge/models/stylized-tree/scene.gltf
 *
 * It prints a summary and writes the full report next to the model as <name>-report.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const MAXIMUM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const round = (n: number): number => Math.round(n * 1000) / 1000;

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
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
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

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: tsx scripts/inspect-model.ts <model.gltf|model.glb>');
    process.exit(1);
  }
  const path = resolve(input);
  const { gltf, buffers } = await load(path);

  const world: number[] = [];
  const tris: number[] = [];
  const triPrimitive: number[] = [];
  const primitives: Json[] = [];

  const visit = (index: number, parent: number[]): void => {
    const node = gltf.nodes[index];
    const matrix = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      mesh.primitives.forEach((primitive: Json) => {
        if (primitive.mode !== undefined && primitive.mode !== 4) return;
        const positions = readAccessor(gltf, buffers, primitive.attributes.POSITION);
        const indices =
          primitive.indices !== undefined ? readAccessor(gltf, buffers, primitive.indices) : null;
        const first = world.length / 3;
        for (let v = 0; v < positions.length; v += 3) {
          const x = positions[v],
            y = positions[v + 1],
            z = positions[v + 2];
          world.push(
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
          );
        }
        const count = Math.floor((indices ? indices.length : positions.length / 3) / 3);
        for (let t = 0; t < count * 3; t++) tris.push(first + (indices ? indices[t] : t));
        for (let t = 0; t < count; t++) triPrimitive.push(primitives.length);
        const material = gltf.materials?.[primitive.material];
        primitives.push({
          node: node.name ?? `node ${index}`,
          mesh: mesh.name ?? `mesh ${node.mesh}`,
          material: material?.name ?? 'none',
          baseColor: material?.pbrMetallicRoughness?.baseColorFactor?.map(round),
          texture: material?.pbrMetallicRoughness?.baseColorTexture !== undefined,
          vertexColors: primitive.attributes.COLOR_0 !== undefined,
          uvs: primitive.attributes.TEXCOORD_0 !== undefined,
          triangles: count,
        });
      });
    }
    for (const child of node.children ?? []) visit(child, matrix);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY);

  const vertexTotal = world.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexTotal; v++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], world[v * 3 + k]);
      max[k] = Math.max(max[k], world[v * 3 + k]);
    }
  }
  const size = max.map((m, k) => m - min[k]);

  // Weld vertices that share a position (hard edges and UV seams split them), then group the
  // triangles into connected pieces.
  const step = Math.max(...size) * 1e-5 || 1;
  const welded = new Map<string, number>();
  const weldId = new Int32Array(vertexTotal);
  for (let v = 0; v < vertexTotal; v++) {
    const key = [0, 1, 2].map((k) => Math.round(world[v * 3 + k] / step)).join(',');
    let id = welded.get(key);
    if (id === undefined) {
      id = welded.size;
      welded.set(key, id);
    }
    weldId[v] = id;
  }
  const parent = Int32Array.from({ length: welded.size }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = find(weldId[tris[t]]);
    for (const other of [tris[t + 1], tris[t + 2]]) {
      const b = find(weldId[other]);
      if (a !== b) parent[b] = a;
    }
  }
  const pieces = new Map<number, Json>();
  for (let t = 0; t < tris.length; t += 3) {
    const root = find(weldId[tris[t]]);
    let piece = pieces.get(root);
    if (!piece) {
      piece = {
        triangles: 0,
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        primitives: new Set<number>(),
      };
      pieces.set(root, piece);
    }
    piece.triangles++;
    piece.primitives.add(triPrimitive[t / 3]);
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) {
        const value = world[tris[t + c] * 3 + k];
        piece.min[k] = Math.min(piece.min[k], value);
        piece.max[k] = Math.max(piece.max[k], value);
      }
    }
  }
  const ranked = [...pieces.values()]
    .sort((a, b) => b.triangles - a.triangles)
    .map((piece) => ({
      triangles: piece.triangles,
      min: piece.min.map(round),
      max: piece.max.map(round),
      primitives: [...piece.primitives],
    }));

  const report = {
    file: basename(path),
    generator: gltf.asset?.generator,
    extensionsRequired: gltf.extensionsRequired ?? [],
    triangles: tris.length / 3,
    vertices: vertexTotal,
    bounds: { min: min.map(round), max: max.map(round), size: size.map(round) },
    images: (gltf.images ?? []).map((image: Json) => image.uri ?? image.mimeType ?? 'embedded'),
    primitives,
    pieceCount: ranked.length,
    pieces: ranked.slice(0, 40),
  };
  const out = join(
    ROOT,
    '.starforge',
    'models',
    `${basename(path).replace(/\.[^.]+$/, '')}-${basename(dirname(path))}-report.json`,
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`${report.file}: ${report.triangles} triangles, ${report.vertices} vertices`);
  console.log(`size x/y/z: ${report.bounds.size.join(' / ')}  (generator: ${report.generator})`);
  console.log('primitives:');
  for (const p of primitives) {
    console.log(`  ${p.node} / ${p.mesh} / material "${p.material}": ${p.triangles} tris`);
  }
  console.log(`${ranked.length} connected pieces; the largest:`);
  for (const piece of ranked.slice(0, 8)) {
    console.log(`  ${piece.triangles} tris, y ${piece.min[1]}..${piece.max[1]}`);
  }
  console.log(`wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
