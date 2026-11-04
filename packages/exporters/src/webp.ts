import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from './png';

export interface WebpOptions {
  width: number;
  height: number;
  /** RGBA frames, each width * height * 4 bytes. */
  frames: (Uint8Array | Uint8ClampedArray)[];
  fps: number;
  /** Lossy quality 0..100. Default 80. */
  quality?: number;
  /** Number of times to play; 0 loops forever (default). */
  loops?: number;
  /** Path to libwebp's img2webp. Default: "img2webp" from PATH. */
  binary?: string;
}

/** Command-line arguments for img2webp. Exported for testing. */
export function img2webpArgs(
  frameFiles: string[],
  output: string,
  options: { fps: number; quality: number; loops: number },
): string[] {
  const delay = Math.max(1, Math.round(1000 / options.fps));
  return [
    '-loop',
    String(options.loops),
    '-lossy',
    '-q',
    String(options.quality),
    '-d',
    String(delay),
    ...frameFiles,
    '-o',
    output,
  ];
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += String(data);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(
              `${command} not found. Install libwebp (macOS: brew install webp; Debian/Ubuntu: apt-get install webp).`,
            )
          : error,
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/** Encode RGBA frames as a lossy animated WebP using libwebp's img2webp. */
export async function encodeWebp(options: WebpOptions): Promise<Uint8Array> {
  const { width, height, frames, fps } = options;
  const quality = options.quality ?? 80;
  if (frames.length === 0) throw new RangeError('at least one frame is required');
  if (!(fps > 0)) throw new RangeError('fps must be positive');
  if (!(quality >= 0 && quality <= 100)) throw new RangeError('quality must be between 0 and 100');

  const directory = await mkdtemp(join(tmpdir(), 'starforge-webp-'));
  try {
    const files: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const file = join(directory, `frame-${String(i).padStart(4, '0')}.png`);
      await writeFile(file, encodePng(width, height, frames[i] as Uint8Array));
      files.push(file);
    }
    const output = join(directory, 'out.webp');
    await run(
      options.binary ?? 'img2webp',
      img2webpArgs(files, output, { fps, quality, loops: options.loops ?? 0 }),
    );
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
