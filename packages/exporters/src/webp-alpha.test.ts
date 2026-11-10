import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { encodeWebp } from './webp';

const hasBinary = spawnSync('img2webp', ['-version']).error === undefined;
const SIZE = 16;

function frame(alpha: (pixel: number) => number): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    pixels[i * 4] = 200;
    pixels[i * 4 + 1] = 120;
    pixels[i * 4 + 2] = 40;
    pixels[i * 4 + 3] = alpha(i);
  }
  return pixels;
}

const hasAlphaChunk = (webp: Uint8Array): boolean =>
  Buffer.from(webp).toString('latin1').includes('ALPH');

describe('encodeWebp and transparency', () => {
  const base = { width: SIZE, height: SIZE, fps: 10 };

  it.skipIf(!hasBinary)('keeps the alpha channel of transparent frames', async () => {
    const webp = await encodeWebp({
      ...base,
      frames: [frame((i) => (i % 2 === 0 ? 0 : 255)), frame((i) => (i * 4) % 256)],
    });
    expect(hasAlphaChunk(webp)).toBe(true);
  });

  it.skipIf(!hasBinary)('adds no alpha data to opaque frames', async () => {
    const webp = await encodeWebp({ ...base, frames: [frame(() => 255), frame(() => 255)] });
    expect(hasAlphaChunk(webp)).toBe(false);
  });
});
