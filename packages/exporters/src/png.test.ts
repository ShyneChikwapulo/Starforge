import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from './png';

function readChunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: { type: string; data: Uint8Array }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

const PIXELS = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128,
]);

describe('encodePng', () => {
  it('writes the PNG signature', () => {
    expect(Array.from(encodePng(2, 2, PIXELS).subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it('writes IHDR, IDAT and IEND in order with the right header', () => {
    const chunks = readChunks(encodePng(2, 2, PIXELS));
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const view = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
    expect(view.getUint32(0)).toBe(2);
    expect(view.getUint32(4)).toBe(2);
    expect(Array.from(chunks[0].data.subarray(8, 10))).toEqual([8, 6]);
  });

  it('round-trips the pixel data through zlib', () => {
    const idat = readChunks(encodePng(2, 2, PIXELS))[1].data;
    const raw = Array.from(inflateSync(idat));
    expect(raw).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 128]);
  });

  it('ends with the canonical IEND chunk, including its CRC', () => {
    const png = encodePng(2, 2, PIXELS);
    expect(Array.from(png.subarray(-12))).toEqual([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  });

  it('rejects pixel data of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(RangeError);
  });
});
