import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
  cwd = await mkdtemp(join(tmpdir(), 'starforge-info-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with info cards', () => {
  it('writes none by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.infoCards).toEqual([]);
    const files = await readdir(result.directory);
    expect(files).not.toContain('languages-card.svg');
  });

  it('writes <id>-card.svg for each, in the order listed', async () => {
    const config = parseConfig({ ...small, infoCards: ['heatmap', 'languages'] });
    const result = await generate({ config, metrics, cwd });
    expect(result.infoCards).toEqual([
      join(result.directory, 'heatmap-card.svg'),
      join(result.directory, 'languages-card.svg'),
    ]);
    expect(await readFile(result.infoCards![0]!, 'utf8')).toContain('aria-label="ACTIVITY"');
  });

  it('draws them in the chosen skin, and as pieces of a page', async () => {
    const config = parseConfig({ ...small, infoCards: ['languages'], skin: 'default', page: true });
    const result = await generate({ config, metrics, cwd });
    const svg = await readFile(result.infoCards![0]!, 'utf8');
    expect(svg).not.toContain('#fcee09');
    expect(svg).toContain('M14,0 V');
  });

  it('lists them after the preset cards and before the divider and footer', async () => {
    const config = parseConfig({
      ...small,
      infoCards: ['languages'],
      presetCard: true,
      page: true,
      divider: 'Presets',
    });
    const result = await generate({ config, metrics, cwd });
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg galaxy-card.svg languages-card.svg divider.svg footer.svg\n`,
    );
  });
});
