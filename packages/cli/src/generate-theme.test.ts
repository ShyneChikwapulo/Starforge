import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';

const metrics = createSampleMetrics();
const small = { username: 'sample-user', width: 64, height: 32, frames: 3, format: 'apng' };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-theme-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with themes', () => {
  it('writes one set of files, named as before, by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.variants.map((v) => v.theme)).toEqual(['dark']);
    expect((await readdir(result.directory)).sort()).toEqual([
      'galaxy-legend.svg',
      'galaxy-poster.png',
      'galaxy.png',
      'metrics.json',
    ]);
  });

  it('writes a light set beside the dark one for "both"', async () => {
    const result = await generate({
      config: parseConfig({ ...small, theme: 'both' }),
      metrics,
      cwd,
    });
    expect(result.variants.map((v) => v.theme)).toEqual(['dark', 'light']);
    expect((await readdir(result.directory)).sort()).toEqual([
      'galaxy-legend.svg',
      'galaxy-light-legend.svg',
      'galaxy-light-poster.png',
      'galaxy-light.png',
      'galaxy-poster.png',
      'galaxy.png',
      'metrics.json',
    ]);
    const [dark, light] = result.variants;
    expect(await readFile(dark!.poster)).not.toEqual(await readFile(light!.poster));
    expect(await readFile(light!.legend!, 'utf8')).toContain('#24292f');
    expect(await readFile(dark!.legend!, 'utf8')).not.toContain('<rect');
  });

  it('writes only the light set for "light"', async () => {
    const result = await generate({
      config: parseConfig({ ...small, theme: 'light' }),
      metrics,
      cwd,
    });
    expect(result.variants.map((v) => v.theme)).toEqual(['light']);
    expect(result.animation.endsWith('galaxy-light.png')).toBe(true);
  });
});
