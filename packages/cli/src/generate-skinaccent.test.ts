import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  cwd = await mkdtemp(join(tmpdir(), 'starforge-accent-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const draw = async (extra: Record<string, unknown>): Promise<string> => {
  const config = parseConfig({ ...small, infoCards: ['opensource'], ...extra });
  const result = await generate({ config, metrics, cwd });
  return readFile(result.infoCards![0]!, 'utf8');
};

describe('generate with skinAccent', () => {
  it('leaves the cyberpunk look and the plain default skin as they were', async () => {
    expect(await draw({})).toContain('#fcee09');
    expect(await draw({ skin: 'default' })).toContain('#3fb950');
  });

  it('draws in the accent when there is one', async () => {
    const svg = await draw({ skin: 'default', skinAccent: '#ff2e88' });
    expect(svg).toContain('#ff2e88');
    expect(svg).not.toContain('#3fb950');
    expect(svg).not.toContain('#fcee09');
  });

  it('is byte-identical to the plain default skin when given its own accent', async () => {
    const plain = await draw({ skin: 'default' });
    expect(await draw({ skin: 'default', skinAccent: '#3FB950' })).toBe(plain);
  });

  it('reaches every kind of card in a page', async () => {
    const config = parseConfig({
      ...small,
      skin: 'default',
      skinAccent: '#ff2e88',
      card: true,
      hero: true,
      page: true,
      divider: 'Test',
      infoCards: ['heatmap', 'rhythm'],
    });
    const result = await generate({ config, metrics, cwd });
    const paths = [
      result.card!,
      result.hero!,
      result.divider!,
      result.footer!,
      ...result.infoCards!,
    ];
    for (const path of paths) {
      const svg = await readFile(path, 'utf8');
      expect(svg, path).not.toContain('#3fb950');
      expect(svg, path).not.toContain('#fcee09');
    }
  });
});
