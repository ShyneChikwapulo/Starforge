import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';
import { formatStepOutputs } from './outputs';

const metrics = createSampleMetrics();
const small = { username: 'sample-user', width: 64, height: 32, frames: 3, format: 'apng' };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-hero-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a hero card', () => {
  it('writes no hero card by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.hero).toBeUndefined();
    expect(await readdir(result.directory)).not.toContain('hero.svg');
  });

  it('writes hero.svg when asked, without a character', async () => {
    const result = await generate({ config: parseConfig({ ...small, hero: true }), metrics, cwd });
    expect(result.hero).toBe(join(result.directory, 'hero.svg'));
    const svg = await readFile(result.hero!, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<image');
  });

  it('embeds the character from a folder, relative to the working directory', async () => {
    await mkdir(join(cwd, 'char'));
    await writeFile(
      join(cwd, 'char', 'meta.json'),
      JSON.stringify({ width: 10, height: 20, frames: 2, fps: 4 }),
    );
    await writeFile(join(cwd, 'char', 'sprite.webp'), 'fake');
    const config = parseConfig({ ...small, hero: true, heroCharacter: 'char' });
    const result = await generate({ config, metrics, cwd });
    const svg = await readFile(result.hero!, 'utf8');
    expect(svg).toContain('data:image/webp;base64,ZmFrZQ==');
    expect(svg).toContain('width="20" height="20"');
  });

  it('says what is wrong with a character folder that is missing', async () => {
    const config = parseConfig({ ...small, hero: true, heroCharacter: 'nowhere' });
    await expect(generate({ config, metrics, cwd })).rejects.toThrow(/meta\.json/);
  });

  it('says what is wrong with a folder that has no sprite', async () => {
    await mkdir(join(cwd, 'char'));
    await writeFile(
      join(cwd, 'char', 'meta.json'),
      JSON.stringify({ width: 10, height: 20, frames: 2 }),
    );
    const config = parseConfig({ ...small, hero: true, heroCharacter: 'char' });
    await expect(generate({ config, metrics, cwd })).rejects.toThrow(/sprite/);
  });

  it('puts the hero card in the list of files to publish, after the profile card', async () => {
    const config = parseConfig({ ...small, card: true, hero: true });
    const result = await generate({ config, metrics, cwd });
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg card.svg hero.svg\n`,
    );
  });
});
