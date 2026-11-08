import { NORMAL_QUANT, SILHOUETTE_QUANT, silhouetteData } from './tree-silhouette-data';

/**
 * Baked point sets in model units: the tree is 1 tall, its base sits at the origin and y points
 * up. Each array holds x, y, z triples. Any prefix of an array is an evenly spread subset, so a
 * preset can take as many points as its particle budget allows.
 */
export interface Silhouette {
  trunk: Float32Array;
  branches: Float32Array;
  leaves: Float32Array;
  /** Unit surface normals for the trunk and branch points, in the same order as the points. */
  trunkNormals: Float32Array;
  branchNormals: Float32Array;
}

/** Decode base64 of little-endian int16 values, scaled by SILHOUETTE_QUANT. */
function decode(base64: string): Float32Array {
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

let cached: Silhouette | undefined;

/** The decoded silhouette, built on first use and shared afterwards. Do not modify the arrays. */
export function getSilhouette(): Silhouette {
  cached ??= {
    trunk: decode(silhouetteData.trunk),
    branches: decode(silhouetteData.branches),
    leaves: decode(silhouetteData.leaves),
    trunkNormals: decodeNormals(silhouetteData.trunkNormals),
    branchNormals: decodeNormals(silhouetteData.branchNormals),
  };
  return cached;
}
