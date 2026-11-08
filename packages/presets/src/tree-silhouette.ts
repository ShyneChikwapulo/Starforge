import {
  MESH_INDEX_BYTES,
  NORMAL_QUANT,
  SILHOUETTE_QUANT,
  silhouetteData,
} from './tree-silhouette-data';

/** The tree's wood as an indexed triangle mesh, in model units (1 tall, base at the origin). */
export interface SilhouetteMesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Unit normals, same layout. */
  normals: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
}

export interface Silhouette {
  mesh: SilhouetteMesh;
  /**
   * Points on the leaves, as x, y, z triples. Any prefix is an evenly spread subset, so a preset
   * can take as many as its particle budget allows.
   */
  leaves: Float32Array;
}

/** Decode base64 of little-endian int16 values, scaled by SILHOUETTE_QUANT. */
function decodePoints(base64: string): Float32Array {
  const binary = atob(base64);
  const out = new Float32Array(binary.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const value = (binary.charCodeAt(i * 2 + 1) << 8) | binary.charCodeAt(i * 2);
    out[i] = (value >= 0x8000 ? value - 0x10000 : value) / SILHOUETTE_QUANT;
  }
  return out;
}

/** Decode base64 of int8 values, scaled by NORMAL_QUANT. */
function decodeNormals(base64: string): Float32Array {
  const binary = atob(base64);
  const out = new Float32Array(binary.length);
  for (let i = 0; i < out.length; i++) {
    const value = binary.charCodeAt(i);
    out[i] = (value >= 128 ? value - 256 : value) / NORMAL_QUANT;
  }
  return out;
}

/** Decode base64 of unsigned little-endian indices, MESH_INDEX_BYTES wide. */
function decodeIndices(base64: string): Uint32Array {
  const binary = atob(base64);
  const out = new Uint32Array(binary.length / MESH_INDEX_BYTES);
  for (let i = 0; i < out.length; i++) {
    let value = 0;
    for (let b = MESH_INDEX_BYTES - 1; b >= 0; b--) {
      value = value * 256 + binary.charCodeAt(i * MESH_INDEX_BYTES + b);
    }
    out[i] = value;
  }
  return out;
}

let cached: Silhouette | undefined;

/** The decoded silhouette, built on first use and shared afterwards. Do not modify the arrays. */
export function getSilhouette(): Silhouette {
  cached ??= {
    mesh: {
      positions: decodePoints(silhouetteData.positions),
      normals: decodeNormals(silhouetteData.normals),
      indices: decodeIndices(silhouetteData.indices),
    },
    leaves: decodePoints(silhouetteData.leaves),
  };
  return cached;
}
