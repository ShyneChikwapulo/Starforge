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

/** Bilinear resize to the given size, with per-column lookups computed once. */
function upsample(src: Layer, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height * 3);
  const left = new Int32Array(width);
  const right = new Int32Array(width);
  const frac = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = Math.min(src.width - 1, Math.max(0, ((x + 0.5) * src.width) / width - 0.5));
    const x0 = Math.floor(fx);
    left[x] = x0;
    right[x] = Math.min(src.width - 1, x0 + 1);
    frac[x] = fx - x0;
  }

  for (let y = 0; y < height; y++) {
    const fy = Math.min(src.height - 1, Math.max(0, ((y + 0.5) * src.height) / height - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    const rowTop = y0 * src.width;
    const rowBottom = y1 * src.width;
    for (let x = 0; x < width; x++) {
      const tx = frac[x];
      const topLeft = (rowTop + left[x]) * 3;
      const topRight = (rowTop + right[x]) * 3;
      const bottomLeft = (rowBottom + left[x]) * 3;
      const bottomRight = (rowBottom + right[x]) * 3;
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = src.data[topLeft + c] * (1 - tx) + src.data[topRight + c] * tx;
        const bottom = src.data[bottomLeft + c] * (1 - tx) + src.data[bottomRight + c] * tx;
        out[o + c] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  return out;
}

/**
 * Add a glow to a floating-point RGB light buffer, in place.
 * Wide blurs are weighted less than tight ones, so bright particles get a hot core and a soft halo.
 * Levels are combined coarse-to-fine, so only one full-resolution pass is needed.
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
  if (pyramid.length === 0) return;

  const weights = pyramid.map((_, i) => 1 / (i + 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const last = pyramid.length - 1;
  let combined: Layer = {
    width: pyramid[last].width,
    height: pyramid[last].height,
    data: pyramid[last].data.map((value) => value * weights[last]),
  };
  for (let i = last - 1; i >= 0; i--) {
    const level = pyramid[i];
    const merged = upsample(combined, level.width, level.height);
    for (let j = 0; j < merged.length; j++) merged[j] += level.data[j] * weights[i];
    combined = { width: level.width, height: level.height, data: merged };
  }

  const glow = upsample(combined, width, height);
  const scale = options.strength / totalWeight;
  for (let j = 0; j < accum.length; j++) accum[j] += glow[j] * scale;
}
