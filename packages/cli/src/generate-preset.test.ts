import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';

const metrics = createSampleMetrics();
const small = { username: 'sample-user', width: 96, height: 48, frames: 4, format: 'apng' };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-preset-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a chosen preset', () => {
  it('names the files after the preset and uses its caption', async () => {
    const result = await generate({
      config: parseConfig({ ...small, preset: 'tunnel' }),
      metrics,
      cwd,
    });
    expect(result.animation.endsWith('tunnel.png')).toBe(true);
    expect(result.poster.endsWith('tunnel-poster.png')).toBe(true);
    expect(await readFile(result.legend!, 'utf8')).toContain('Stripes:');
  });

  it('keeps the galaxy file names and caption by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.animation.endsWith('galaxy.png')).toBe(true);
    expect(await readFile(result.legend!, 'utf8')).toContain('Arms:');
  });

  it('rejects an unknown preset in the config', () => {
    expect(() => parseConfig({ username: 'x', preset: 'nope' })).toThrow();
  });
});
