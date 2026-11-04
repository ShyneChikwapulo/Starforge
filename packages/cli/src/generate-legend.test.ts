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
  cwd = await mkdtemp(join(tmpdir(), 'starforge-legend-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate legend', () => {
  it('writes a legend SVG by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.legend?.endsWith('galaxy-legend.svg')).toBe(true);
    expect(await readFile(result.legend!, 'utf8')).toContain('<svg');
  });

  it('skips the legend when it is turned off', async () => {
    const result = await generate({
      config: parseConfig({ ...small, legend: false }),
      metrics,
      cwd,
    });
    expect(result.legend).toBeUndefined();
  });
});
