import { paeth } from './png';

/** Test helper: undo PNG scanline filtering for 8-bit RGBA and return the pixel bytes. */
export function unfilterScanlines(raw: Uint8Array, width: number, height: number): number[] {
  const bpp = 4;
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? out[target + i - bpp] : 0;
      const up = y > 0 ? out[target - stride + i] : 0;
      const upLeft = y > 0 && i >= bpp ? out[target - stride + i - bpp] : 0;
      let predicted = 0;
      if (type === 1) predicted = left;
      else if (type === 2) predicted = up;
      else if (type === 3) predicted = (left + up) >> 1;
      else if (type === 4) predicted = paeth(left, up, upLeft);
      out[target + i] = (raw[source + i] + predicted) & 0xff;
    }
  }
  return Array.from(out);
}
