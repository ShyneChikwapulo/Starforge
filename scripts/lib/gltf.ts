import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;

const SIZES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const MAXIMUM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Read a .gltf (with its buffers) or a .glb. */
export async function load(path: string): Promise<{ gltf: Json; buffers: Buffer[] }> {
  const data = await readFile(path);
  if (data.readUInt32LE(0) === 0x46546c67) {
    let gltf: Json;
    let bin = Buffer.alloc(0);
    for (let offset = 12; offset < data.length;) {
      const length = data.readUInt32LE(offset);
      const type = data.readUInt32LE(offset + 4);
      const part = data.subarray(offset + 8, offset + 8 + length);
      if (type === 0x4e4f534a) gltf = JSON.parse(part.toString('utf8'));
      else if (type === 0x004e4942) bin = part;
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

export function readAccessor(gltf: Json, buffers: Buffer[], index: number): Float64Array {
  const accessor = gltf.accessors[index];
  const width = WIDTHS[accessor.type] ?? 1;
  const size = SIZES[accessor.componentType]!;
  const out = new Float64Array(accessor.count * width);
  if (accessor.bufferView === undefined) return out;
  const view = gltf.bufferViews[accessor.bufferView];
  const data = buffers[view.buffer]!;
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

/** Column-major 4x4 product a * b. */
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

export function localMatrix(node: Json): number[] {
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

/**
 * Every triangle of the scene in world space, as a soup of 9 numbers per triangle, with skinned
 * meshes posed at rest (their skeleton's current node transforms), animations ignored.
 */
export function worldTriangles(gltf: Json, buffers: Buffer[]): number[] {
  const nodes: Json[] = gltf.nodes ?? [];
  const world: number[][] = new Array(nodes.length);
  const walk = (index: number, parent: number[]): void => {
    world[index] = multiply(parent, localMatrix(nodes[index]));
    for (const child of nodes[index].children ?? []) walk(child, world[index]!);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) walk(root, IDENTITY);

  const place = (m: ArrayLike<number>, p: Float64Array, v: number, out: Float64Array): void => {
    const x = p[v * 3]!;
    const y = p[v * 3 + 1]!;
    const z = p[v * 3 + 2]!;
    out[v * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    out[v * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    out[v * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  };

  const soup: number[] = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !world[index]) return;
    for (const primitive of gltf.meshes[node.mesh].primitives as Json[]) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const positions = readAccessor(gltf, buffers, primitive.attributes.POSITION);
      const vertexCount = positions.length / 3;
      const placed = new Float64Array(positions.length);

      if (node.skin !== undefined && primitive.attributes.JOINTS_0 !== undefined) {
        const skin = gltf.skins[node.skin];
        const inverse = readAccessor(gltf, buffers, skin.inverseBindMatrices);
        const joints: number[][] = skin.joints.map((joint: number, j: number) =>
          multiply(world[joint]!, inverse.subarray(j * 16, j * 16 + 16)),
        );
        const ids = readAccessor(gltf, buffers, primitive.attributes.JOINTS_0);
        const weights = readAccessor(gltf, buffers, primitive.attributes.WEIGHTS_0);
        for (let v = 0; v < vertexCount; v++) {
          const blend = new Array<number>(16).fill(0);
          for (let k = 0; k < 4; k++) {
            const weight = weights[v * 4 + k]!;
            if (weight === 0) continue;
            const joint = joints[ids[v * 4 + k]!]!;
            for (let c = 0; c < 16; c++) blend[c] += weight * joint[c]!;
          }
          place(blend, positions, v, placed);
        }
      } else {
        for (let v = 0; v < vertexCount; v++) place(world[index]!, positions, v, placed);
      }

      const indices =
        primitive.indices !== undefined ? readAccessor(gltf, buffers, primitive.indices) : null;
      const count = Math.floor((indices ? indices.length : vertexCount) / 3);
      for (let t = 0; t < count * 3; t++) {
        const v = indices ? indices[t]! : t;
        soup.push(placed[v * 3]!, placed[v * 3 + 1]!, placed[v * 3 + 2]!);
      }
    }
  });
  return soup;
}
