import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics, parseMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';

const hasBinary = spawnSync('img2webp', ['-version']).error === undefined;
const metrics = createSampleMetrics();
const small = { username: 'sample-user', width: 96, height: 48, frames: 6, bloom: 0.5 };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-generate-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate', () => {
  it('writes an animation, a poster and a metrics snapshot', async () => {
    const config = parseConfig({ ...small, format: 'apng' });
    const result = await generate({ config, metrics, cwd });

    const animation = await readFile(result.animation);
    expect(animation.toString('latin1')).toContain('acTL');

    const poster = await readFile(result.poster);
    expect(Array.from(poster.subarray(0, 4))).toEqual([137, 80, 78, 71]);

    const saved = JSON.parse(await readFile(result.metrics!, 'utf8'));
    expect(() => parseMetrics(saved)).not.toThrow();
  });

  it('leaves the saved metrics alone when only the timestamp changed', async () => {
    const config = parseConfig({ ...small, format: 'apng' });
    const first = await generate({ config, metrics, cwd });
    const before = await readFile(first.metrics!, 'utf8');

    await generate({ config, metrics: { ...metrics, generatedAt: '2030-01-01T00:00:00Z' }, cwd });
    expect(await readFile(first.metrics!, 'utf8')).toBe(before);
  });

  it('skips the metrics file when saveMetrics is off', async () => {
    const config = parseConfig({ ...small, format: 'apng', saveMetrics: false });
    const result = await generate({ config, metrics, cwd });
    expect(result.metrics).toBeUndefined();
  });

  it('needs a token when no metrics are supplied', async () => {
    const config = parseConfig({ ...small, format: 'apng' });
    await expect(generate({ config, cwd })).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it.skipIf(!hasBinary)('writes an animated WebP by default', async () => {
    const config = parseConfig(small);
    const result = await generate({ config, metrics, cwd });
    const text = (await readFile(result.animation)).toString('latin1');
    expect(result.animation.endsWith('galaxy.webp')).toBe(true);
    expect(text.slice(0, 4)).toBe('RIFF');
    expect(text.slice(8, 12)).toBe('WEBP');
  });
});
