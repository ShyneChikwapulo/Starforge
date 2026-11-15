import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HeroCharacter } from '@starforge/exporters';
import { z } from 'zod';

const MetaSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.number().int().min(1),
  fps: z.number().positive().default(8),
});

const SPRITES: [file: string, type: string][] = [
  ['sprite.webp', 'image/webp'],
  ['sprite.png', 'image/png'],
];

/**
 * Read a hero character from a folder: `meta.json` (frame width, height, count and fps) and the
 * frames as one horizontal strip, `sprite.webp` or `sprite.png`. scripts/build-sprite.py writes
 * exactly this.
 */
export async function loadHeroCharacter(directory: string): Promise<HeroCharacter> {
  let meta: z.infer<typeof MetaSchema>;
  try {
    meta = MetaSchema.parse(JSON.parse(await readFile(join(directory, 'meta.json'), 'utf8')));
  } catch {
    throw new Error(`Cannot read a valid meta.json in the hero character folder: ${directory}`);
  }
  for (const [file, type] of SPRITES) {
    let data: Buffer;
    try {
      data = await readFile(join(directory, file));
    } catch {
      continue;
    }
    return {
      href: `data:${type};base64,${data.toString('base64')}`,
      frameWidth: meta.width,
      frameHeight: meta.height,
      frames: meta.frames,
      fps: meta.fps,
    };
  }
  throw new Error(`No sprite.webp or sprite.png in the hero character folder: ${directory}`);
}
