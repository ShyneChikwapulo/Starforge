import { deflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: length, type, data and CRC. */
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** IHDR payload for an 8-bit RGBA image. */
export function createHeader(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return header;
}

const BYTES_PER_PIXEL = 4;

/** The PNG Paeth predictor. */
export function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pLeft = Math.abs(p - left);
  const pUp = Math.abs(p - up);
  const pUpLeft = Math.abs(p - upLeft);
  return pLeft <= pUp && pLeft <= pUpLeft ? left : pUp <= pUpLeft ? up : upLeft;
}

/**
 * Filter one scanline into `out` and return a score: the sum of absolute residuals,
 * treating bytes as signed. Lower scores compress better.
 */
function filterRow(
  type: number,
  row: Uint8Array | Uint8ClampedArray,
  prior: Uint8Array | Uint8ClampedArray | null,
  out: Uint8Array,
): number {
  let score = 0;
  for (let i = 0; i < row.length; i++) {
    const left = i >= BYTES_PER_PIXEL ? row[i - BYTES_PER_PIXEL] : 0;
    const up = prior ? prior[i] : 0;
    const upLeft = prior && i >= BYTES_PER_PIXEL ? prior[i - BYTES_PER_PIXEL] : 0;
    let predicted = 0;
    switch (type) {
      case 1:
        predicted = left;
        break;
      case 2:
        predicted = up;
        break;
      case 3:
        predicted = (left + up) >> 1;
        break;
      case 4:
        predicted = paeth(left, up, upLeft);
        break;
    }
    const value = (row[i] - predicted) & 0xff;
    out[i] = value;
    score += value < 128 ? value : 256 - value;
  }
  return score;
}

/**
 * Filter every scanline with whichever PNG filter gives the smallest residuals, then deflate
 * (the payload of IDAT or fdAT). Smooth gradients, such as bloom, shrink dramatically.
 */
export function compressPixels(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`expected ${width * height * 4} bytes of RGBA data, got ${rgba.length}`);
  }
  const stride = width * BYTES_PER_PIXEL;
  const raw = new Uint8Array((stride + 1) * height);
  const trial = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null;
    const base = y * (stride + 1);

    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type <= 4; type++) {
      const score = filterRow(type, row, prior, trial);
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        raw.set(trial, base + 1);
      }
    }
    raw[base] = bestType;
  }
  return deflateSync(raw, { level: 9 });
}

/** Encode 8-bit RGBA pixels (row-major, top-left first) as a PNG file. */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  return concatBytes([
    PNG_SIGNATURE,
    chunk('IHDR', createHeader(width, height)),
    chunk('IDAT', compressPixels(width, height, rgba)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
