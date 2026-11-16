import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHeroCharacter } from './hero-character';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'starforge-character-'));
  await writeFile(join(dir, 'sprite.webp'), 'fake');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadHeroCharacter', () => {
  it('reads the density from meta.json', async () => {
    await writeFile(
      join(dir, 'meta.json'),
      JSON.stringify({ width: 570, height: 750, frames: 24, fps: 8, density: 1.5 }),
    );
    const character = await loadHeroCharacter(dir);
    expect(character.density).toBe(1.5);
    expect(character.frameWidth).toBe(570);
    expect(character.frames).toBe(24);
  });

  it('defaults to a density of 1, so older sprites draw as before', async () => {
    await writeFile(
      join(dir, 'meta.json'),
      JSON.stringify({ width: 380, height: 500, frames: 30 }),
    );
    const character = await loadHeroCharacter(dir);
    expect(character.density).toBe(1);
    expect(character.fps).toBe(8);
  });

  it('refuses a density that is not positive', async () => {
    await writeFile(
      join(dir, 'meta.json'),
      JSON.stringify({ width: 380, height: 500, frames: 30, density: 0 }),
    );
    await expect(loadHeroCharacter(dir)).rejects.toThrow(/meta\.json/);
  });
});
