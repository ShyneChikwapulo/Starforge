import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { encodeWebp, img2webpArgs } from './webp';

const hasBinary = spawnSync('img2webp', ['-version']).error === undefined;

function frame(shade: number): Uint8Array {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = shade;
    pixels[i + 1] = shade / 2;
    pixels[i + 2] = 40;
    pixels[i + 3] = 255;
  }
  return pixels;
}

describe('img2webpArgs', () => {
  it('builds the img2webp command line', () => {
    expect(
      img2webpArgs(['a.png', 'b.png'], 'out.webp', { fps: 15, quality: 80, loops: 0 }),
    ).toEqual(['-loop', '0', '-lossy', '-q', '80', '-d', '67', 'a.png', 'b.png', '-o', 'out.webp']);
  });
});

describe('encodeWebp', () => {
  const base = { width: 16, height: 16, fps: 10 };

  it('rejects invalid input before touching the disk', async () => {
    await expect(encodeWebp({ ...base, frames: [] })).rejects.toThrow(RangeError);
    await expect(encodeWebp({ ...base, frames: [frame(0)], fps: 0 })).rejects.toThrow(RangeError);
    await expect(encodeWebp({ ...base, frames: [frame(0)], quality: 101 })).rejects.toThrow(
      RangeError,
    );
  });

  it('reports a helpful error when the binary is missing', async () => {
    await expect(
      encodeWebp({ ...base, frames: [frame(0)], binary: 'definitely-not-installed-img2webp' }),
    ).rejects.toThrow(/not found/);
  });

  it.skipIf(!hasBinary)('produces an animated WebP', async () => {
    const webp = await encodeWebp({ ...base, frames: [frame(0), frame(100), frame(200)] });
    const text = Buffer.from(webp).toString('latin1');
    expect(text.slice(0, 4)).toBe('RIFF');
    expect(text.slice(8, 12)).toBe('WEBP');
    expect(text).toContain('ANMF');
  });
});
