import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodeApng } from './apng';
import { unfilterScanlines } from './test-helpers';

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

const u32 = (data: Uint8Array, at: number) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at);
const u16 = (data: Uint8Array, at: number) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(at);

const FRAMES = [
  Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]),
  Uint8Array.from([0, 0, 255, 255, 255, 255, 255, 255]),
  Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80]),
];

const encode = (fps = 10) => encodeApng({ width: 2, height: 1, frames: FRAMES, fps });

describe('encodeApng', () => {
  it('writes the chunks in APNG order', () => {
    expect(readChunks(encode()).map((c) => c.type)).toEqual([
      'IHDR',
      'acTL',
      'fcTL',
      'IDAT',
      'fcTL',
      'fdAT',
      'fcTL',
      'fdAT',
      'IEND',
    ]);
  });

  it('declares the frame count and loops forever by default', () => {
    const control = readChunks(encode()).find((c) => c.type === 'acTL')!;
    expect(u32(control.data, 0)).toBe(3);
    expect(u32(control.data, 4)).toBe(0);
  });

  it('numbers fcTL and fdAT chunks consecutively', () => {
    const sequences = readChunks(encode())
      .filter((c) => c.type === 'fcTL' || c.type === 'fdAT')
      .map((c) => u32(c.data, 0));
    expect(sequences).toEqual([0, 1, 2, 3, 4]);
  });

  it('round-trips every frame through zlib', () => {
    const chunks = readChunks(encode());
    const idat = chunks.find((c) => c.type === 'IDAT')!.data;
    const fdats = chunks.filter((c) => c.type === 'fdAT').map((c) => c.data.subarray(4));
    const decoded = [idat, ...fdats].map((data) => unfilterScanlines(inflateSync(data), 2, 1));
    expect(decoded).toEqual(FRAMES.map((pixels) => Array.from(pixels)));
  });

  it('encodes the frame delay from fps', () => {
    const control = readChunks(encode(10)).find((c) => c.type === 'fcTL')!;
    expect(u16(control.data, 20)).toBe(100);
    expect(u16(control.data, 22)).toBe(1000);
  });

  it('rejects invalid input', () => {
    expect(() => encodeApng({ width: 2, height: 1, frames: [], fps: 10 })).toThrow(RangeError);
    expect(() => encodeApng({ width: 2, height: 1, frames: FRAMES, fps: 0 })).toThrow(RangeError);
    expect(() => encodeApng({ width: 2, height: 1, frames: [new Uint8Array(3)], fps: 10 })).toThrow(
      RangeError,
    );
  });
});
