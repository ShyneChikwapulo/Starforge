import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SolidMesh } from '../../packages/core/src/mesh';
import { multiply, readAccessor, type Json } from './gltf';
import { decodePng } from './png';

interface Texture {
  width: number;
  height: number;
  rgba: Uint8Array;
}

interface Primitive {
  node: number;
  skin: number | undefined;
  positions: Float64Array;
  normals: Float64Array;
  joints: Float64Array | null;
  weights: Float64Array | null;
  /** Base colour per vertex, texture times material factor. */
  colors: Float32Array;
  /** Triangles that survived the transparency cull. */
  indices: Uint32Array;
}

export interface Character {
  gltf: Json;
  primitives: Primitive[];
  inverse: Float64Array[];
  stats: { triangles: number; dropped: number; vertices: number };
}

/** Uniform scale plus the point that ends up at the origin. */
export interface Fit {
  scale: number;
  x: number;
  y: number;
  z: number;
}

function sampleTexture(t: Texture, u: number, v: number, out: number[]): void {
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  const x = Math.min(t.width - 1, Math.floor(fu * t.width));
  const y = Math.min(t.height - 1, Math.floor(fv * t.height));
  const o = (y * t.width + x) * 4;
  for (let k = 0; k < 4; k++) out[k] = t.rgba[o + k]! / 255;
}

/**
 * Collect every triangle primitive of the model with its colours baked per vertex from the base
 * colour textures (PNGs named <image-index>.png in `textureDir`). With `dropTransparent`,
 * triangles of masked or blended materials whose average alpha is low are left out.
 */
export function prepareCharacter(
  gltf: Json,
  buffers: Buffer[],
  textureDir: string,
  dropTransparent: boolean,
  hide: string[] = [],
): Character {
  const cache = new Map<number, Texture | null>();
  const image = (source: number): Texture | null => {
    if (!cache.has(source)) {
      try {
        cache.set(source, decodePng(readFileSync(join(textureDir, `${source}.png`))));
      } catch {
        cache.set(source, null);
      }
    }
    return cache.get(source) ?? null;
  };

  const primitives: Primitive[] = [];
  let triangles = 0;
  let dropped = 0;
  let vertices = 0;
  ((gltf.nodes ?? []) as Json[]).forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const meshName: string = gltf.meshes[node.mesh].name ?? '';
    if (hide.includes(node.name ?? '') || hide.includes(meshName)) return;
    for (const primitive of gltf.meshes[node.mesh].primitives as Json[]) {
      if ((primitive.mode ?? 4) !== 4) continue;
      if (primitive.attributes.NORMAL === undefined) throw new Error('A mesh has no normals');
      const positions = readAccessor(gltf, buffers, primitive.attributes.POSITION);
      const normals = readAccessor(gltf, buffers, primitive.attributes.NORMAL);
      const count = positions.length / 3;
      vertices += count;

      const material: Json = gltf.materials?.[primitive.material] ?? {};
      const pbr: Json = material.pbrMetallicRoughness ?? {};
      const factor: number[] = pbr.baseColorFactor ?? [1, 1, 1, 1];
      const info: Json = pbr.baseColorTexture;
      const source: number | undefined = info ? gltf.textures?.[info.index]?.source : undefined;
      const texture = source === undefined ? null : image(source);
      const uvAttribute = info ? primitive.attributes[`TEXCOORD_${info.texCoord ?? 0}`] : undefined;
      const uvs = uvAttribute === undefined ? null : readAccessor(gltf, buffers, uvAttribute);

      const colors = new Float32Array(count * 3);
      const alpha = new Float32Array(count);
      const px = [1, 1, 1, 1];
      for (let v = 0; v < count; v++) {
        if (texture && uvs) sampleTexture(texture, uvs[v * 2]!, uvs[v * 2 + 1]!, px);
        else px.fill(1);
        colors[v * 3] = px[0]! * factor[0]!;
        colors[v * 3 + 1] = px[1]! * factor[1]!;
        colors[v * 3 + 2] = px[2]! * factor[2]!;
        alpha[v] = px[3]! * (factor[3] ?? 1);
      }

      const mode: string = material.alphaMode ?? 'OPAQUE';
      const cutoff = mode === 'MASK' ? (material.alphaCutoff ?? 0.5) : 0.5;
      const raw =
        primitive.indices !== undefined ? readAccessor(gltf, buffers, primitive.indices) : null;
      const total = Math.floor((raw ? raw.length : count) / 3);
      const kept: number[] = [];
      for (let t = 0; t < total; t++) {
        const a = raw ? raw[t * 3]! : t * 3;
        const b = raw ? raw[t * 3 + 1]! : t * 3 + 1;
        const c = raw ? raw[t * 3 + 2]! : t * 3 + 2;
        triangles++;
        if (
          dropTransparent &&
          mode !== 'OPAQUE' &&
          (alpha[a]! + alpha[b]! + alpha[c]!) / 3 < cutoff
        ) {
          dropped++;
          continue;
        }
        kept.push(a, b, c);
      }

      const skinned = node.skin !== undefined && primitive.attributes.JOINTS_0 !== undefined;
      primitives.push({
        node: nodeIndex,
        skin: skinned ? node.skin : undefined,
        positions,
        normals,
        joints: skinned ? readAccessor(gltf, buffers, primitive.attributes.JOINTS_0) : null,
        weights: skinned ? readAccessor(gltf, buffers, primitive.attributes.WEIGHTS_0) : null,
        colors,
        indices: Uint32Array.from(kept),
      });
    }
  });

  const inverse = ((gltf.skins ?? []) as Json[]).map((skin) =>
    readAccessor(gltf, buffers, skin.inverseBindMatrices),
  );
  return { gltf, primitives, inverse, stats: { triangles, dropped, vertices } };
}

/** The whole model posed by `world` (from poseWorld), in the model's own units. */
export function skinCharacter(character: Character, world: number[][]): SolidMesh {
  const skins: number[][][] = ((character.gltf.skins ?? []) as Json[]).map((skin, s) =>
    (skin.joints as number[]).map((joint, j) =>
      multiply(world[joint]!, character.inverse[s]!.subarray(j * 16, j * 16 + 16)),
    ),
  );

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const p of character.primitives) {
    vertexTotal += p.positions.length / 3;
    indexTotal += p.indices.length;
  }
  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const colors = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);

  const blend = new Array<number>(16).fill(0);
  let vBase = 0;
  let iBase = 0;
  for (const p of character.primitives) {
    const count = p.positions.length / 3;
    const joints = p.skin === undefined ? undefined : skins[p.skin];
    const fixed = world[p.node]!;
    for (let v = 0; v < count; v++) {
      let m: ArrayLike<number> = fixed;
      if (p.joints && p.weights && joints) {
        blend.fill(0);
        let used = 0;
        for (let k = 0; k < 4; k++) {
          const weight = p.weights[v * 4 + k]!;
          if (weight === 0) continue;
          const joint = joints[p.joints[v * 4 + k]!]!;
          for (let c = 0; c < 16; c++) blend[c] += weight * joint[c]!;
          used += weight;
        }
        if (used > 0) m = blend;
      }
      const x = p.positions[v * 3]!;
      const y = p.positions[v * 3 + 1]!;
      const z = p.positions[v * 3 + 2]!;
      const o = (vBase + v) * 3;
      positions[o] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      positions[o + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      positions[o + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      const nx = p.normals[v * 3]!;
      const ny = p.normals[v * 3 + 1]!;
      const nz = p.normals[v * 3 + 2]!;
      const tx = m[0]! * nx + m[4]! * ny + m[8]! * nz;
      const ty = m[1]! * nx + m[5]! * ny + m[9]! * nz;
      const tz = m[2]! * nx + m[6]! * ny + m[10]! * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      normals[o] = tx / length;
      normals[o + 1] = ty / length;
      normals[o + 2] = tz / length;
    }
    colors.set(p.colors, vBase * 3);
    for (let i = 0; i < p.indices.length; i++) indices[iBase + i] = p.indices[i]! + vBase;
    vBase += count;
    iBase += p.indices.length;
  }
  return { positions, normals, colors, indices };
}

const percentile = (values: Float32Array, p: number): number => {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
};

/** Scale and centre that make the model `height` tall, ignoring a few stray vertices. */
export function measureFit(mesh: SolidMesh, height: number): Fit {
  const n = mesh.positions.length / 3;
  const axes = [0, 1, 2].map((a) => {
    const values = new Float32Array(n);
    for (let v = 0; v < n; v++) values[v] = mesh.positions[v * 3 + a]!;
    return [percentile(values, 0.002), percentile(values, 0.998)] as const;
  });
  const [xs, ys, zs] = axes as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  return {
    scale: height / (ys[1] - ys[0] || 1),
    x: (xs[0] + xs[1]) / 2,
    y: (ys[0] + ys[1]) / 2,
    z: (zs[0] + zs[1]) / 2,
  };
}

/**
 * Move a posed mesh into the renderer's space. The renderer is left-handed and looks along +z, so
 * the scene is mirrored once, in x, to compensate: a character that faces -z (as this model does)
 * then faces the camera and is not mirrored in the picture.
 */
export function fitMesh(mesh: SolidMesh, fit: Fit, facing: '+z' | '-z' = '-z'): SolidMesh {
  const sx = facing === '-z' ? -1 : 1;
  const sz = facing === '-z' ? 1 : -1;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = sx * (mesh.positions[i]! - fit.x) * fit.scale;
    positions[i + 1] = (mesh.positions[i + 1]! - fit.y) * fit.scale;
    positions[i + 2] = sz * (mesh.positions[i + 2]! - fit.z) * fit.scale;
    normals[i] = sx * mesh.normals[i]!;
    normals[i + 1] = mesh.normals[i + 1]!;
    normals[i + 2] = sz * mesh.normals[i + 2]!;
  }
  return { positions, normals, colors: mesh.colors, indices: mesh.indices };
}
