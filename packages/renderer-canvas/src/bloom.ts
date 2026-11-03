export interface BloomOptions {
  /** How much blurred light is added back. 0 disables bloom. */
  strength: number;
  /** Blur scales; each level halves the resolution again. Default 4, maximum 6. */
  levels?: number;
}

interface Layer {
  width: number;
  height: number;
  /** Interleaved RGB. */
  data: Float32Array;
}

const KERNEL = [0.0625, 0.25, 0.375, 0.25, 0.0625];

function downsample(src: Layer): Layer {
  const width = Math.max(1, src.width >> 1);
  const height = Math.max(1, src.height >> 1);
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const y0 = Math.min(src.height - 1, y * 2);
    const y1 = Math.min(src.height - 1, y * 2 + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(src.width - 1, x * 2);
      const x1 = Math.min(src.width - 1, x * 2 + 1);
      for (let c = 0; c < 3; c++) {
        data[(y * width + x) * 3 + c] =
          (src.data[(y0 * src.width + x0) * 3 + c] +
            src.data[(y0 * src.width + x1) * 3 + c] +
            src.data[(y1 * src.width + x0) * 3 + c] +
            src.data[(y1 * src.width + x1) * 3 + c]) *
          0.25;
      }
    }
  }
  return { width, height, data };
}

/** Separable 5-tap binomial blur (a close cousin of a Gaussian). */
function blur(src: Layer): Layer {
  const { width, height } = src;
  const horizontal = new Float32Array(src.data.length);
  const out = new Float32Array(src.data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          const xi = Math.min(width - 1, Math.max(0, x + k));
          sum += src.data[(y * width + xi) * 3 + c] * KERNEL[k + 2];
        }
        horizontal[(y * width + x) * 3 + c] = sum;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          const yi = Math.min(height - 1, Math.max(0, y + k));
          sum += horizontal[(yi * width + x) * 3 + c] * KERNEL[k + 2];
        }
        out[(y * width + x) * 3 + c] = sum;
      }
    }
  }
  return { width, height, data: out };
}

function sample(layer: Layer, fx: number, fy: number, c: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(layer.width - 1, x0 + 1);
  const y1 = Math.min(layer.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number) => layer.data[(y * layer.width + x) * 3 + c];
  return (
    (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) +
    (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty
  );
}

/**
 * Add a glow to a floating-point RGB light buffer, in place.
 * Wide blurs are weighted less than tight ones, so bright particles get a hot core and a soft halo.
 */
export function applyBloom(
  accum: Float32Array,
  width: number,
  height: number,
  options: BloomOptions,
): void {
  if (!(options.strength > 0)) return;
  const levels = Math.max(1, Math.min(options.levels ?? 4, 6));

  const pyramid: Layer[] = [];
  let layer: Layer = { width, height, data: accum };
  for (let level = 0; level < levels; level++) {
    if (layer.width <= 1 && layer.height <= 1) break;
    layer = blur(downsample(layer));
    pyramid.push(layer);
  }

  const weights = pyramid.map((_, i) => 1 / (i + 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let glow = 0;
        for (let i = 0; i < pyramid.length; i++) {
          const level = pyramid[i];
          const fx = Math.min(
            level.width - 1,
            Math.max(0, ((x + 0.5) * level.width) / width - 0.5),
          );
          const fy = Math.min(
            level.height - 1,
            Math.max(0, ((y + 0.5) * level.height) / height - 0.5),
          );
          glow += sample(level, fx, fy, c) * weights[i];
        }
        accum[(y * width + x) * 3 + c] += (options.strength * glow) / totalWeight;
      }
    }
  }
}
