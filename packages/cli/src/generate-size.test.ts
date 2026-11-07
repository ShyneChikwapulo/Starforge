import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';

const metrics = createSampleMetrics();
const base = { username: 'sample-user', preset: 'tree', frames: 2, format: 'apng' };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-size-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function dimensions(path: string): Promise<{ width: number; height: number }> {
  const png = await readFile(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('default sizes', () => {
  it("uses the preset's own size when width and height are omitted", async () => {
    const result = await generate({ config: parseConfig(base), metrics, cwd });
    expect(await dimensions(result.poster)).toEqual({ width: 600, height: 800 });
  });

  it('lets the config override the preset size', async () => {
    const config = parseConfig({ ...base, width: 96, height: 48 });
    const result = await generate({ config, metrics, cwd });
    expect(await dimensions(result.poster)).toEqual({ width: 96, height: 48 });
  });
});
