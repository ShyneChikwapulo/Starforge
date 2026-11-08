import type { SolidMesh } from '@starforge/core';
import type { Camera } from './render';

/** The mesh as the camera sees it: one value per output pixel. */
export interface MeshLayer {
  /** Lit colour, 0..1 per channel. Only meaningful where coverage is above 0. */
  color: Float32Array;
  /** Share of the pixel the mesh covers, 0..1. Edges are anti-aliased. */
  coverage: Float32Array;
  /** View-space depth of the nearest covered sample, Infinity where the mesh is absent. */
  depth: Float32Array;
}

/** Samples per pixel along each axis. 2 gives four samples and smooth edges. */
const SAMPLES = 2;
/** Key light in view space (x right, y up, z away): from the upper left, towards the viewer. */
const LIGHT = (() => {
  const x = -0.4;
  const y = 0.55;
  const z = -0.75;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
})();
const AMBIENT = 0.32;
/** A faint cool light along silhouettes, so a dark side never disappears into the background. */
const RIM_COLOR = [0.12, 0.34, 0.3];
const RIM_STRENGTH = 0.6;

/**
 * Draw a mesh with the same camera model as the particles: z-buffered, two-sided, Gouraud shaded
 * with one key light and a rim. It returns a per-pixel layer so the particle pass can hide what
 * is behind the mesh and the final composite can keep the mesh out of the bloom.
 */
export function rasterizeMesh(
  mesh: SolidMesh,
  camera: Camera,
  width: number,
  height: number,
): MeshLayer {
  const sw = width * SAMPLES;
  const sh = height * SAMPLES;
  const sampleColor = new Float32Array(sw * sh * 3);
  const sampleDepth = new Float32Array(sw * sh).fill(Infinity);

  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const focal = sh / 2 / Math.tan(camera.fov / 2);
  const centerX = sw / 2;
  const centerY = sh / 2;

  // Project every vertex once, and rotate its normal into view space.
  const vertexCount = mesh.positions.length / 3;
  const px = new Float32Array(vertexCount);
  const py = new Float32Array(vertexCount);
  const pd = new Float32Array(vertexCount);
  const nx = new Float32Array(vertexCount);
  const ny = new Float32Array(vertexCount);
  const nz = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const i = v * 3;
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];
    const orbitX = x * cosYaw + z * sinYaw;
    const orbitZ = -x * sinYaw + z * cosYaw;
    const tiltY = y * cosPitch + orbitZ * sinPitch;
    const tiltZ = -y * sinPitch + orbitZ * cosPitch;
    const depth = tiltZ + camera.distance;
    const scale = focal / Math.max(depth, 1e-6);
    px[v] = centerX + orbitX * scale;
    py[v] = centerY - tiltY * scale;
    pd[v] = depth;

    const ox = mesh.normals[i] * cosYaw + mesh.normals[i + 2] * sinYaw;
    const oz = -mesh.normals[i] * sinYaw + mesh.normals[i + 2] * cosYaw;
    nx[v] = ox;
    ny[v] = mesh.normals[i + 1] * cosPitch + oz * sinPitch;
    nz[v] = -mesh.normals[i + 1] * sinPitch + oz * cosPitch;
  }

  const lit = new Float32Array(9);
  const shade = (v: number, flip: number, offset: number): void => {
    const x = nx[v] * flip;
    const y = ny[v] * flip;
    const z = nz[v] * flip;
    const lambert = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
    const light = AMBIENT + (1 - AMBIENT) * lambert;
    const edge = 1 - Math.min(1, Math.abs(z));
    const rim = edge * edge * RIM_STRENGTH;
    for (let k = 0; k < 3; k++) {
      lit[offset + k] = Math.min(1, mesh.colors[v * 3 + k] * light + RIM_COLOR[k] * rim);
    }
  };

  const { indices } = mesh;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    if (pd[a] < 0.1 || pd[b] < 0.1 || pd[c] < 0.1) continue;

    const x0 = px[a];
    const y0 = py[a];
    const x1 = px[b];
    const y1 = py[b];
    const x2 = px[c];
    const y2 = py[c];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(sw - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(sh - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    // Two-sided: light the side that faces the camera (it looks along +z, so that is nz < 0).
    const flip = nz[a] + nz[b] + nz[c] > 0 ? -1 : 1;
    shade(a, flip, 0);
    shade(b, flip, 3);
    shade(c, flip, 6);

    const invArea = 1 / area;
    const i0 = 1 / pd[a];
    const i1 = 1 / pd[b];
    const i2 = 1 / pd[c];
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * invArea;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * invArea;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // Perspective-correct: interpolate 1/depth linearly, then recover depth and colour.
        const q0 = w0 * i0;
        const q1 = w1 * i1;
        const q2 = w2 * i2;
        const depth = 1 / (q0 + q1 + q2);
        const sample = y * sw + x;
        if (depth >= sampleDepth[sample]) continue;
        sampleDepth[sample] = depth;
        const k = sample * 3;
        sampleColor[k] = (q0 * lit[0] + q1 * lit[3] + q2 * lit[6]) * depth;
        sampleColor[k + 1] = (q0 * lit[1] + q1 * lit[4] + q2 * lit[7]) * depth;
        sampleColor[k + 2] = (q0 * lit[2] + q1 * lit[5] + q2 * lit[8]) * depth;
      }
    }
  }

  // Resolve the samples to one value per pixel.
  const color = new Float32Array(width * height * 3);
  const coverage = new Float32Array(width * height);
  const depth = new Float32Array(width * height).fill(Infinity);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let covered = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let nearest = Infinity;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const sample = (y * SAMPLES + sy) * sw + x * SAMPLES + sx;
          const d = sampleDepth[sample];
          if (d === Infinity) continue;
          covered++;
          r += sampleColor[sample * 3];
          g += sampleColor[sample * 3 + 1];
          b += sampleColor[sample * 3 + 2];
          if (d < nearest) nearest = d;
        }
      }
      if (covered === 0) continue;
      const pixel = y * width + x;
      coverage[pixel] = covered / (SAMPLES * SAMPLES);
      color[pixel * 3] = r / covered;
      color[pixel * 3 + 1] = g / covered;
      color[pixel * 3 + 2] = b / covered;
      depth[pixel] = nearest;
    }
  }
  return { color, coverage, depth };
}
