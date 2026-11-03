import type { ParticleState } from '@starforge/core';

export interface Camera {
  /** Rotation around the vertical axis, radians. A full 2π turn returns to the start. */
  yaw: number;
  /** Tilt above the scene, radians. 0 looks edge-on, π/2 looks straight down. */
  pitch: number;
  /** Distance from the origin to the camera. */
  distance: number;
  /** Vertical field of view, radians. */
  fov: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  camera: Camera;
  /** Background as RGB 0..1, or null for a transparent image. */
  background: [number, number, number] | null;
  /** World-space radius of a size-1 particle. Default 0.06. */
  pointScale?: number;
  /** Multiplies accumulated light before tone mapping. Default 1. */
  exposure?: number;
}

export interface Frame {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, row-major from the top-left. */
  data: Uint8ClampedArray;
}

export const DEFAULT_CAMERA: Camera = {
  yaw: 0.4,
  pitch: 0.55,
  distance: 28,
  fov: Math.PI / 4,
};

/** The camera after orbiting `turn` full revolutions (1 = back where it started). */
export function orbitCamera(camera: Camera, turn: number): Camera {
  return { ...camera, yaw: camera.yaw + turn * Math.PI * 2 };
}

const tone = (value: number): number => value / (1 + value);
const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Software point-sprite renderer. Each particle becomes a soft glowing disc and
 * overlapping glows add up. Only basic arithmetic is used per pixel, so the
 * result is identical on every platform.
 */
export function renderFrame(state: ParticleState, options: RenderOptions): Frame {
  const { width, height, camera, background } = options;
  const pointScale = options.pointScale ?? 0.06;
  const exposure = options.exposure ?? 1;

  const accum = new Float32Array(width * height * 3);
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const focal = height / 2 / Math.tan(camera.fov / 2);
  const centerX = width / 2;
  const centerY = height / 2;
  const { position, color, size } = state;

  for (let p = 0; p < state.count; p++) {
    const i = p * 3;
    const x = position[i];
    const y = position[i + 1];
    const z = position[i + 2];

    // Orbit around Y, then tilt so the far side of the scene appears higher.
    const orbitX = x * cosYaw + z * sinYaw;
    const orbitZ = -x * sinYaw + z * cosYaw;
    const tiltY = y * cosPitch + orbitZ * sinPitch;
    const tiltZ = -y * sinPitch + orbitZ * cosPitch;

    const depth = tiltZ + camera.distance;
    if (depth < 0.1) continue;

    const scale = focal / depth;
    const screenX = centerX + orbitX * scale;
    const screenY = centerY - tiltY * scale;
    const radius = Math.max(0.8, size[p] * pointScale * scale);
    const reach = radius * 2.5;

    const minX = Math.max(0, Math.floor(screenX - reach));
    const maxX = Math.min(width - 1, Math.ceil(screenX + reach));
    const minY = Math.max(0, Math.floor(screenY - reach));
    const maxY = Math.min(height - 1, Math.ceil(screenY + reach));
    if (minX > maxX || minY > maxY) continue;

    const fade = clamp(camera.distance / depth, 0.3, 1.5);
    const red = color[i] * fade;
    const green = color[i + 1] * fade;
    const blue = color[i + 2] * fade;
    const invReach2 = 1 / (reach * reach);

    for (let py = minY; py <= maxY; py++) {
      const dy = py + 0.5 - screenY;
      for (let px = minX; px <= maxX; px++) {
        const dx = px + 0.5 - screenX;
        const t = (dx * dx + dy * dy) * invReach2;
        if (t >= 1) continue;
        const weight = (1 - t) * (1 - t);
        const k = (py * width + px) * 3;
        accum[k] += red * weight;
        accum[k + 1] += green * weight;
        accum[k + 2] += blue * weight;
      }
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const k = pixel * 3;
    const o = pixel * 4;
    const r = tone(accum[k] * exposure);
    const g = tone(accum[k + 1] * exposure);
    const b = tone(accum[k + 2] * exposure);

    if (background) {
      data[o] = (background[0] + r * (1 - background[0])) * 255;
      data[o + 1] = (background[1] + g * (1 - background[1])) * 255;
      data[o + 2] = (background[2] + b * (1 - background[2])) * 255;
      data[o + 3] = 255;
    } else {
      const alpha = Math.max(r, g, b);
      if (alpha > 0) {
        data[o] = (r / alpha) * 255;
        data[o + 1] = (g / alpha) * 255;
        data[o + 2] = (b / alpha) * 255;
        data[o + 3] = alpha * 255;
      }
    }
  }
  return { width, height, data };
}
