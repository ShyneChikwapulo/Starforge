import { PNG_SIGNATURE, chunk, compressPixels, concatBytes, createHeader } from './png';

export interface ApngOptions {
  width: number;
  height: number;
  /** RGBA frames, each width * height * 4 bytes. */
  frames: (Uint8Array | Uint8ClampedArray)[];
  fps: number;
  /** Number of times to play; 0 loops forever (default). */
  loops?: number;
}

function animationControl(frameCount: number, loops: number): Uint8Array {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setUint32(0, frameCount);
  view.setUint32(4, loops);
  return data;
}

function frameControl(
  sequence: number,
  width: number,
  height: number,
  delayNum: number,
  delayDen: number,
): Uint8Array {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint32(12, 0); // x offset
  view.setUint32(16, 0); // y offset
  view.setUint16(20, delayNum);
  view.setUint16(22, delayDen);
  data[24] = 0; // dispose: none
  data[25] = 0; // blend: source (replace the frame, including alpha)
  return data;
}

/** Encode RGBA frames as an animated PNG. */
export function encodeApng(options: ApngOptions): Uint8Array {
  const { width, height, frames, fps } = options;
  if (frames.length === 0) throw new RangeError('at least one frame is required');
  if (!(fps > 0)) throw new RangeError('fps must be positive');

  // Frame delay is delayNum / delayDen seconds.
  const delayNum = 100;
  const delayDen = Math.max(1, Math.round(fps * 100));

  const parts: Uint8Array[] = [
    PNG_SIGNATURE,
    chunk('IHDR', createHeader(width, height)),
    chunk('acTL', animationControl(frames.length, options.loops ?? 0)),
  ];

  let sequence = 0;
  frames.forEach((pixels, index) => {
    parts.push(chunk('fcTL', frameControl(sequence++, width, height, delayNum, delayDen)));
    const compressed = compressPixels(width, height, pixels);
    if (index === 0) {
      parts.push(chunk('IDAT', compressed));
    } else {
      const data = new Uint8Array(4 + compressed.length);
      new DataView(data.buffer).setUint32(0, sequence++);
      data.set(compressed, 4);
      parts.push(chunk('fdAT', data));
    }
  });

  parts.push(chunk('IEND', new Uint8Array(0)));
  return concatBytes(parts);
}
