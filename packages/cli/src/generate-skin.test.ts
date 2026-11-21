import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';

const metrics = createSampleMetrics();
const small = {
  username: 'sample-user',
  width: 64,
  height: 32,
  frames: 3,
  format: 'apng',
  card: true,
  hero: true,
  presetCard: true,
  page: true,
  divider: 'Presets',
};

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-skin-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a skin', () => {
  it('draws every card in the default skin, with none of the neon palette', async () => {
    const result = await generate({
      config: parseConfig({ ...small, skin: 'default' }),
      metrics,
      cwd,
    });
    for (const file of [
      result.card!,
      result.hero!,
      result.presetCard!,
      result.footer!,
      result.divider!,
    ]) {
      const svg = await readFile(file, 'utf8');
      expect(svg.startsWith('<svg'), file).toBe(true);
      expect(svg, file).not.toContain('#fcee09');
    }
  });

  it('draws every card in the cyberpunk skin by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    for (const file of [
      result.card!,
      result.hero!,
      result.presetCard!,
      result.footer!,
      result.divider!,
    ]) {
      expect(await readFile(file, 'utf8'), file).toContain('#fcee09');
    }
  });
});
